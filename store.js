(function (global) {
  var GH = { owner: "YH-EDU", repo: "sugyot-tefillin-al-hadaf", branch: "main" };
  var SUGYA_LETTERS = {
    a: "א", b: "ב", c: "ג", d: "ד", e: "ה", f: "ו", g: "ז",
    h: "ח", i: "ט", j: "י", k: "יא", l: "יב", m: "יג"
  };
  var TOKEN_KEY = "tefillin-gh-token";

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value.trim());
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }
  function canSave() { return !!token(); }
  function sugyaName(sugyaId) {
    return "סוגיא " + (SUGYA_LETTERS[sugyaId] || String(sugyaId || ""));
  }
  function apiUrl(path) {
    return "https://api.github.com/repos/" + GH.owner + "/" + GH.repo + "/contents/" +
      String(path).split("/").map(encodeURIComponent).join("/");
  }
  function headers() {
    return {
      Authorization: "Bearer " + token(),
      Accept: "application/vnd.github+json"
    };
  }
  function bytesToBase64(buffer) {
    var bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
    var out = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }
  function textToBase64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }
  function getJson(path) {
    return fetch(apiUrl(path) + "?ref=" + GH.branch, { headers: headers() }).then(function (res) {
      if (res.status === 404) return { exists: false, sha: "", json: null, raw: null };
      if (!res.ok) throw new Error("github-get");
      return res.json().then(function (data) {
        var raw = "";
        if (data.encoding === "base64") {
          var bin = atob(data.content.replace(/\n/g, ""));
          var bytes = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          raw = new TextDecoder("utf-8").decode(bytes);
        }
        var json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = null; }
        return { exists: true, sha: data.sha, json: json, raw: raw };
      });
    });
  }
  function putFile(path, contentBase64, message, sha) {
    var body = { message: message, content: contentBase64, branch: GH.branch };
    if (sha) body.sha = sha;
    return fetch(apiUrl(path), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers()),
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (err) { throw new Error((err && err.message) || "github-put"); });
      return res.json();
    });
  }
  function deleteFile(path, message) {
    return fetch(apiUrl(path) + "?ref=" + GH.branch, { headers: headers() }).then(function (res) {
      if (res.status === 404) return;
      if (!res.ok) throw new Error("github-get");
      return res.json().then(function (data) {
        return fetch(apiUrl(path), {
          method: "DELETE",
          headers: Object.assign({ "Content-Type": "application/json" }, headers()),
          body: JSON.stringify({ message: message, sha: data.sha, branch: GH.branch })
        });
      });
    });
  }
  function loadRegistry() {
    return getJson("חומרים/רישום.json").then(function (info) {
      var items = (info.json && info.json.items) || [];
      return { sha: info.sha, items: items };
    });
  }
  function saveRegistry(items, sha, message) {
    return putFile("חומרים/רישום.json", textToBase64(JSON.stringify({ items: items }, null, 2)), message, sha);
  }
  function safeName(name) {
    return String(name || "קובץ").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "קובץ";
  }
  function pdfPages(file) {
    if (!global.pdfjsLib) return Promise.resolve([]);
    return file.arrayBuffer().then(function (buf) {
      return global.pdfjsLib.getDocument({ data: buf }).promise.then(function (doc) {
        var jobs = [];
        var count = Math.min(doc.numPages, 20);
        for (var i = 1; i <= count; i++) jobs.push(renderPdfPage(doc, i));
        return Promise.all(jobs);
      });
    }).catch(function () { return []; });
  }
  function renderPdfPage(doc, num) {
    return doc.getPage(num).then(function (page) {
      var viewport = page.getViewport({ scale: 1.6 });
      var canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      return page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise.then(function () {
        return canvasToJpeg(canvas);
      });
    });
  }
  function canvasToJpeg(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) return resolve(null);
        blob.arrayBuffer().then(resolve);
      }, "image/jpeg", 0.86);
    });
  }

  function uploadFile(sugyaId, role, file) {
    if (!canSave()) return Promise.reject(new Error("no-token"));
    if (file.size > 90 * 1024 * 1024) return Promise.reject(new Error("too-big"));
    var name = safeName(file.name);
    var ext = name.toLowerCase().replace(/^.*\./, "");
    var isVideo = /^(mp4|webm|mov|m4v)$/.test(ext) || (file.type || "").indexOf("video/") === 0;
    var isPdf = ext === "pdf" || (file.type || "").indexOf("pdf") !== -1;
    var isImage = /^(png|jpg|jpeg|webp|gif)$/.test(ext) || (file.type || "").indexOf("image/") === 0;
    var folderRole = isVideo ? "סרטונים" : (role === "מבחנים" ? "מבחנים" : "עזרים");
    var stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    var place = sugyaName(sugyaId);
    var folder = "חומרים/" + place + "/" + folderRole + "/" + stamp + "-" + name.replace(/\.[^.]+$/, "");
    var kind = isVideo ? "video" : (isPdf || isImage ? "pages" : "file");
    showProgress("שומר באתר: " + name);
    return file.arrayBuffer().then(function (buf) {
      return putFile(folder + "/" + name, bytesToBase64(buf), "הוספת " + name + " ל" + place).then(function () {
        var pages = [];
        var next = Promise.resolve();
        if (isImage) pages = [name];
        if (isPdf) {
          next = pdfPages(file).then(function (images) {
            var jobs = images.filter(Boolean).map(function (bytes, i) {
              var pageName = "p" + String(i + 1).padStart(2, "0") + ".jpg";
              pages.push(pageName);
              return putFile(folder + "/" + pageName, bytesToBase64(bytes), "דף " + (i + 1) + " מתוך " + name);
            });
            return Promise.all(jobs);
          });
        }
        return next.then(function () {
          var meta = {
            id: stamp + "-" + name.replace(/\.[^.]+$/, ""),
            name: name,
            role: folderRole,
            type: kind,
            pages: pages,
            file: name,
            path: folder,
            sugya: sugyaId
          };
          return putFile(folder + "/meta.json", textToBase64(JSON.stringify(meta, null, 2)), "רישום " + name).then(function () {
            return loadRegistry().then(function (reg) {
              var items = reg.items.filter(function (row) { return row.id !== meta.id; });
              items.push(publicItem(meta));
              return saveRegistry(items, reg.sha, "עדכון רישום חומרים").then(function () { return publicItem(meta); });
            });
          });
        });
      });
    });
  }

  function publicItem(meta) {
    var rel = meta.path;
    return {
      id: meta.id,
      name: meta.name,
      role: meta.role,
      type: meta.type,
      pages: (meta.pages || []).map(function (p) { return "/" + rel + "/" + p; }),
      file: meta.file ? "/" + rel + "/" + meta.file : "",
      path: rel,
      sugya: meta.sugya || "",
      youtubeId: meta.youtubeId || "",
      url: meta.url || ""
    };
  }

  function addYoutube(sugyaId, vid, title) {
    if (!canSave()) return Promise.reject(new Error("no-token"));
    var item = {
      id: "yt-" + vid + "-" + sugyaId,
      name: title || "סרטון יוטיוב",
      role: "youtube",
      type: "youtube",
      youtubeId: vid,
      url: "https://www.youtube.com/watch?v=" + vid,
      sugya: sugyaId
    };
    var place = sugyaName(sugyaId);
    var linksPath = "חומרים/" + place + "/קישורים.json";
    return getJson(linksPath).then(function (info) {
      var links = (info.json || []).filter(function (row) { return row.youtubeId !== vid; });
      links.push(item);
      return putFile(linksPath, textToBase64(JSON.stringify(links, null, 2)), "קישור יוטיוב ל" + place, info.sha);
    }).then(function () {
      return loadRegistry().then(function (reg) {
        var items = reg.items.filter(function (row) {
          return row.youtubeId !== vid || row.sugya !== sugyaId;
        });
        items.push(item);
        return saveRegistry(items, reg.sha, "רישום קישור יוטיוב").then(function () { return item; });
      });
    });
  }

  function removeItem(row) {
    if (!canSave()) return Promise.reject(new Error("no-token"));
    var jobs = [];
    if (row.youtubeId) {
      var place = sugyaName(row.sugya || "a");
      var linksPath = "חומרים/" + place + "/קישורים.json";
      jobs.push(getJson(linksPath).then(function (info) {
        var links = (info.json || []).filter(function (x) { return x.id !== row.id && x.youtubeId !== row.youtubeId; });
        return putFile(linksPath, textToBase64(JSON.stringify(links, null, 2)), "מחיקת קישור יוטיוב", info.sha);
      }));
    } else if (row.path) {
      var rel = row.path.replace(/^\//, "");
      (row.pages || []).forEach(function (src) {
        var name = String(src).split("/").pop();
        if (name) jobs.push(deleteFile(rel + "/" + name, "מחיקת דף"));
      });
      if (row.file) jobs.push(deleteFile(rel + "/" + String(row.file).split("/").pop(), "מחיקת קובץ"));
      jobs.push(deleteFile(rel + "/meta.json", "מחיקת רישום קובץ"));
    }
    return Promise.all(jobs).then(function () {
      return loadRegistry().then(function (reg) {
        var items = reg.items.filter(function (x) { return x.id !== row.id; });
        return saveRegistry(items, reg.sha, "עדכון רישום אחרי מחיקה");
      });
    });
  }

  function showProgress(text) {
    if (typeof global.showToast === "function") global.showToast(text);
  }

  function fetchSiteJson() {
    return fetch("חומרים/רישום.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("registry");
      return res.json();
    }).then(function (data) { return data.items || []; }).catch(function () { return []; });
  }

  global.TefillinStore = {
    canSave: canSave,
    token: token,
    setToken: setToken,
    uploadFile: uploadFile,
    addYoutube: addYoutube,
    removeItem: removeItem,
    fetchSiteJson: fetchSiteJson,
    SUGYA_LETTERS: SUGYA_LETTERS
  };
})(window);
