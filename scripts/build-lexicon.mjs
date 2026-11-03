#!/usr/bin/env node
/**
 * בונה מילון ארמית→עברית ללשון הגמרא.
 *
 * מקורות (בזמן בנייה, לא בדפדפן):
 *   /api/v3/texts/Steinsaltz_on_Menachot.<daf>
 *     <b>מילת גמרא</b> ואחריה <small>[תרגום]</small> = תרגום.
 *     טקסט רגיל בתוך הסוגריים = הסבר. מילה מודגשת של כמה מילים = ביטוי.
 *   /api/v3/texts/Menachot.<daf>?version=hebrew|William Davidson Edition - Vocalized Aramaic
 *     ליישור מול לשון האתר (ניקוד וכתיב).
 *   /api/words/<word>
 *     Jastrow: זיהוי למא ולשורש. אנגלית רק כגיבוי לרשימת הביקורת, לא בטולטיפ.
 *
 * מטמון מקומי: data/cache/  (לא נכנס לגיט). קצב מנומס בין קריאות.
 *
 * סוגיא חדשה: ראו data/sugya-refs.json
 *
 *   node scripts/build-lexicon.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "data", "cache");
const UA = "MenachotSugyotDictionary/1.0 (educational; local build; polite)";
const GAP_MS = 450;
const SHOW_AT = 0.74;
const API = "https://www.sefaria.org";

const PREFIX_HE = { ד: "ש", ו: "ו", ב: "ב", ל: "ל", כ: "כ", מ: "מ", ה: "ה", ש: "ש" };
const PREFIX_LETTERS = "ודבכלמשה";

function isNikud(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x0591 && c <= 0x05c7;
}
function isLetter(ch) {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x05d0 && c <= 0x05ea;
}
const FINALS = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
function skeleton(s) {
  let out = "";
  for (const ch of String(s || "")) {
    if (isNikud(ch)) continue;
    if (FINALS[ch]) out += FINALS[ch];
    else if (isLetter(ch)) out += ch;
  }
  return out;
}

const NAMES = new Set(
  ["רב", "רבי", "שמואל", "הונא", "חייא", "אשי", "נחמן", "יוחנן", "אליעזר", "עקיבא", "יהודה", "מנשיא", "אחא", "פלימו", "אמימר", "רבינא", "יוסי", "נתן", "יצחק", "יעקב", "מנשה", "חסדא", "ינאי", "רמי", "חמא", "אילעא", "אבין", "אלעזר", "אבא", "בידרי", "אריכא", "חורם", "גלילי", "אביי", "רבא", "פפא", "כהנא", "אמי", "מר", "הונא", "אשי", "נחמן", "שילת", "אויא", "מנחם", "פלימו", "ברבי"].map(skeleton)
);
const NAME_BITS = new Set(["בן", "בריה", "דה", "דרב"].map(skeleton));
// בריה is also "son" and sometimes the gloss target. Keep it out of drop-leading names
// but allow "בר" as a connector.
NAME_BITS.delete(skeleton("בריה"));

const HEBREW_CONTENT = new Set(
  ["אמר", "אומר", "אומרים", "תפילין", "תפלין", "תפילה", "תפלה", "יד", "ראש", "מברך", "הלכה", "שבת", "לילה", "יום", "כל", "על", "את", "של", "בין", "לא", "אין", "אם", "כי", "אשר", "ברוך", "מצוה", "מצות", "כתוב", "נאמר", "תלמוד", "לומר", "זו", "זה", "מה", "מי", "עד", "מן", "עם", "אל", "כיצד", "מאימתי", "משעת", "הנחה", "הנחתן", "קשירה", "חולץ", "מניח", "ימין", "שמאל", "איטר", "גידם", "חכמים", "תורה", "ישראל", "משה", "אהרן", "שמע", "קדש", "צונו", "קדשנו", "עיניך", "ידך", "לבבכם", "חמה", "דרך", "שוק", "שינה", "מלחמה", "ציץ", "מצח", "נגע", "קרחה", "גלגלת", "בכור", "אדם", "פדה", "סלע", "סלעים", "כהן", "זרוע", "קיבורת", "קבורת", "קדקד", "רופס", "שער", "צהוב", "לבן", "בשר", "זמן", "עובר", "עשיה", "עשייתן", "ברכה", "אחת", "שתים", "עבירה", "אות", "חוקה", "מועד", "פסח", "ימים", "טובים", "השמר", "פן", "עשה", "לאו", "מותר", "חייב", "שעה", "תמיד", "אזכרה", "אזכרות", "מצחו", "דעת", "כתיבה", "כהה", "כח", "פטור", "שולט", "ידיו", "גובה", "לב", "מקום", "תינוק", "מוח", "ראשים", "גלות", "עשרה", "שלשים", "אך", "חשיכה", "ספק", "חלק", "אחד", "גבות", "עין", "עינים", "פרשה", "פרשיות", "מזוזה", "בית", "כסא", "מרחץ", "שקעה", "רגל", "כלות", "ערב", "ודאי", "ספק", "חשיכה", "גופן", "צריכין", "יכול", "יאמר", "נמצא", "הרי", "אלא", "אחר", "כך", "כדי", "שמא", "יאבדו", "מניחן", "חוזר", "עליה", "עליהן", "עליהם", "בהן", "בו", "להן", "לו", "לי", "שלי", "שלך", "היה", "היתה", "היו", "יהיה", "אני", "אינו", "אינה", "אבל", "שומע", "ליטמא", "יטמא", "סח", "לשמרן", "שמרן", "מערכי", "ערכי", "או", "מודים", "מתיירא", "ממשמש", "משכים", "דברי", "יניח", "יצאו", "לילות", "פרט", "הניח", "חשך", "כן", "מורין", "חומר", "כמה", "וכמה", "משמש", "קל", "אתה", "ידכה", "אטר", "בהי", "כאן", "להלן", "ממש", "שבראש", "בראש", "ליתן", "מהן", "שני", "איזה"].map(skeleton)
);

const UNSPLIT = new Set(
  ["ההוא", "ההיא", "היכא", "היכי", "היך", "הכא", "התם", "הכי", "מאי", "מאן", "מנא", "מנלן", "נמי", "איני", "איכא", "ליכא", "איתמר", "תניא", "קסבר", "נפקא", "פליגא", "שאני", "שמתא", "אורתא", "ינוקא", "גברא", "אידך", "איקרי", "סתמא", "בשלמא", "אסברא", "אלמא", "השתא", "איפכא", "סבירא", "אמרינן", "חיישינן", "מסתברא", "מישמוש", "קונטרס", "תרוייהו", "תרויהו", "כולי", "עלמא", "אדחכי", "אדהכי", "משמיה", "יתיבנא", "מתחזיין", "איתיליד", "רחמנא", "בריה", "ציריא"].map(skeleton)
);

const AR_SEED = new Set(
  ["בר", "איני", "והא", "הא", "נמי", "התם", "הכא", "הכי", "ההוא", "ההיא", "איתמר", "קסבר", "סבר", "תניא", "תנא", "תנו", "מנלן", "מנא", "נפקא", "ליה", "לימא", "איכא", "ליכא", "פליגא", "בריה", "משמיה", "אורתא", "באורתא", "מצלו", "אידך", "איקרי", "סתמא", "דכתיב", "כתיב", "והדר", "הדר", "בשלמא", "אסברא", "צירא", "ציריא", "מתחזיין", "מתחזין", "אדחכי", "אדהכי", "אתא", "גברא", "ינוקא", "תרי", "רישי", "רישא", "שאני", "לאפוקי", "אפוקי", "דאיכא", "קום", "גלי", "שמתא", "אמרי", "לה", "תרוייהו", "תרויהו", "כולי", "עלמא", "מיפלגי", "הוה", "יתיב", "יתיבנא", "קמיה", "חזיתיה", "דעתיה", "בעי", "בעא", "מיניה", "אין", "תנא", "אלמא", "תיפוק", "איריא", "שמע", "מינה", "מיניה", "היכא", "היכי", "היך", "כיצד", "איפכא", "הוי", "השתא", "ניחא", "קונטרס", "סבירא", "להו", "חיישינן", "אמרינן", "אטר", "מדמי", "איירי", "עבורי", "דרעא", "טוטפתא", "למימר", "הרחקה", "טפי", "פגע", "בהו", "ברישא", "חשיב", "ממש", "משמע", "מסתברא", "תדע", "כדאמרינן", "כדמוכח", "כדלקמן", "לענין", "מישמוש", "עביד", "דלילה", "לדמותו", "קרי", "דיכול", "הדוק", "מצמצמו", "דהכא", "דהך", "פלגינהו", "דאמאי", "איתא", "ומיהו", "מיהו", "דכיון", "כיון", "דאין", "הויות", "להדדי", "מוקדם", "מאוחר", "קיימא", "דאמרי", "אמר", "קרא", "יצאו", "פרט", "דברי", "מודים", "לאו", "זמן", "חשיכה", "ממעטא", "ממעטי", "דמהיכא", "מהיכא", "דעשה", "קא", "בעי", "ואמרי", "אמרי", "ליה", "לי", "אין", "חזיתיה", "כמה", "וכמה", "אחת", "או", "אינו", "אלא", "אתה", "אומר", "לא", "איקרי", "והתניא", "התניא", "התני", "כי", "ההיא", "יתיב", "ציריא", "סבר", "מר", "בעא", "מיניה", "גברא", "תרי", "רישי", "שאני", "הכא", "לאפוקי", "דאיכא", "נמי", "שער", "צהוב", "איתיליד", "כמה", "בעינא", "למיתב", "תלא", "רחמנא", "גולגלת", "דיבגולגולת", "רופס", "קדקד", "פלימו", "שני", "ראשים", "איזה", "מהן", "קבל", "עליך", "סבא", "עשרה", "סלעים", "חייב", "ליתן", "נטמרף", "נטמר", "שלשים", "אך", "חלק", "גובה", "שבראש", "קרחה", "מת", "להלן", "כאן", "נגע", "אחד", "בשר", "לבן", "צהוב", "דילמא", "דלמא", "אלמא", "מכלל", "שיעור", "שיעורא", "כמה", "עביד", "קטיר", "קטר", "פשט", "שדי", "מתלית", "דידן", "גרדומי", "כשירות", "מילתא", "חדתתא", "עתיקתא", "אידך", "מתנא", "אתייה", "אבתריה", "מיתלי", "היכי", "כל", "נמי", "פוק", "חזי", "עמא", "דבר", "למיקטריה", "למיתפריה", "עייליה", "לתפירה", "לגאו", "איפסיק", "רצועה", "מהו", "אסורה", "שרי", "נויי", "לבר", "מחוי", "כפוף", "פשוט", "אצבע", "צרדה", "בהו", "בהן", "להו", "להן", "ליה", "לי", "קא", "הוי", "הוה", "הויא", "לדידיה", "דידיה", "אטר", "שוי", "שולט", "פטור", "גידם", "ידכה", "בהי", "כתיב", "ואימא", "אימא", "מי", "כתיב", "חיית", "כהה", "מנא", "נפקא", "מהיכא", "כתנאי", "תניא", "אידך", "התניא", "כי", "ההיא", "שולט", "אית", "לית", "איתא", "ליתא", "אין", "לא", "חוזר", "מברך", "עבירה", "ערכי", "מלחמה", "בשלמא", "דכתיב", "והדר", "מנלן", "אסברא", "לי", "כל", "זמן", "שתים", "כיצד", "משכים", "מתיירא", "ממשמש", "בהן", "אורתא", "איכא", "דאמרי", "פליגא", "ההוא", "התם", "איתמר", "מאי", "קסבר", "אי", "נמי", "לאו", "דמהיכא", "ממעטא", "ממעטי", "לילות", "דתניא", "ימים", "מימים", "פרט", "דברי", "יכול", "יניח", "תלמוד", "לומר", "יצאו", "גופן", "אות", "לימא", "מיפלגי", "דכולי", "עלמא", "אית", "להו", "מר", "סבר", "דעשה", "דלאו", "נמי", "לאו", "מותר", "הוה", "יתיבנא", "קמיה", "חשך", "הניח", "אמרי", "ליה", "ואמר", "לי", "אין", "חזיתיה", "דעתיה", "דלאו", "בעי", "קסבר", "הלכה", "מורין", "כן", "למשמש", "קל", "חומר", "כמה", "וכמה", "אתה", "אומר", "או", "אינו", "אלא", "תלמוד", "לומר", "ואידך", "איקרי", "סתמא", "לא", "מנא", "ליה", "אמר", "ליה", "ואימא", "מי", "כתיב", "כתנאי", "תניא", "אידך", "התניא", "כי", "ההיא", "הוה", "יתיב", "קמיה", "ציריא", "מתחזיין", "לא", "סבר", "לה", "מר", "איתמר", "היכא", "בעא", "מיניה", "אדהכי", "אתא", "ההוא", "גברא", "תרי", "רישי", "שאני", "הכא", "לאפוקי", "דאיכא", "נמי"].map(skeleton)
);

const ROOTS = {
  אמרי: "אמר",
  אמר: "אמר",
  תרוייהו: "תרי",
  תרויהו: "תרי",
  איתמר: "אמר",
  תניא: "תני",
  תנא: "תני",
  תנו: "תני",
  הוה: "הוי",
  הוי: "הוי",
  אתא: "אתי",
  יתיב: "יתב",
  יתיבנא: "יתב",
  קסבר: "סבר",
  סבר: "סבר",
  נפקא: "נפק",
  פליגא: "פלג",
  מיפלגי: "פלג",
  בריה: "בר",
  משמיה: "שמע",
  שמיה: "שמע",
  אורתא: "אורת",
  מצלו: "צלי",
  חזיתיה: "חזי",
  דעתיה: "ידע",
  גברא: "גבר",
  ינוקא: "ינוק",
  רישי: "ראש",
  רישא: "ראש",
  שאני: "שני",
  אסברא: "סבר",
  כתיב: "כתב",
  דכתיב: "כתב",
  איקרי: "קרא",
  סתמא: "סתם",
  ציריא: "צרר",
  צירא: "צרר",
  מתחזיין: "חזי",
  שמתא: "שמת",
  כולי: "כל",
  עלמא: "עלם",
  קמיה: "קדם",
  בעי: "בעי",
  בעא: "בעי",
  סח: "סיח",
  היכא: "היכ",
  היכי: "היכ",
  מנא: "מן",
  מנלן: "מן",
  איכא: "אית",
  ליכא: "לית",
  איתא: "אית",
  נמי: "נמי",
  ההוא: "הוא",
  ההיא: "היא",
  הכא: "הכא",
  התם: "תמן",
  הכי: "הכי",
  איני: "אין",
  אלמא: "אלם",
  לימא: "אמר",
  להו: "להו",
  ליה: "ליה",
  בהו: "בהו",
  אידך: "אחר",
  לאפוקי: "נפק",
  אפוקי: "נפק",
  רחמנא: "רחם",
  תלא: "תלי",
  איתיליד: "ילד",
  למיתב: "יהב",
  בעינא: "בעי",
  גלי: "גלי",
  קום: "קום",
  פלגינהו: "פלג",
  מסתברא: "סבר",
  סבירא: "סבר",
  אמרינן: "אמר",
  חיישינן: "חוש",
  מדמי: "דמי",
  איירי: "איירי",
  מישמוש: "משש",
  קיימא: "קום",
  קונטרס: "קונטרס",
  איפכא: "אפך",
  השתא: "השתא",
  ניחא: "נוח",
  הדר: "הדר",
  בשלמא: "שלם",
  חדתתא: "חדת",
  עתיקתא: "עתק",
  מלתא: "מיל",
  שיעורא: "שער",
  עמא: "עם",
  דבר: "דבר",
  נויי: "נוי",
  אטר: "אטר",
  דידיה: "ידע",
  לשמרן: "שמר",
  שמרן: "שמר",
  מעטא: "מעט",
  ממעטא: "מעט",
  ממעטי: "מעט",
  חשיכה: "חשך",
  דרעא: "דרע",
  טוטפתא: "טוטפת",
  עבורי: "עבר",
  הרחקה: "רחק",
  ברישא: "ראש",
  להדדי: "חד",
  הויות: "הוי",
  מוקדם: "קדם",
  מאוחר: "אחר",
  גולגלת: "גלגל",
  דיבגולגולת: "גלגל"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function lettersOf(s) {
  return String(s || "").replace(/[^\u05D0-\u05EA]/g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function sameWord(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const n = Math.max(a.length, b.length);
  if (n < 6 || Math.abs(a.length - b.length) > 1) return false;
  return levenshtein(a, b) <= 1;
}

let KNOWN_BASE = new Set();
function baseKnown(sk) {
  return !!(sk && (UNSPLIT.has(sk) || AR_SEED.has(sk) || ROOTS[sk] || KNOWN_BASE.has(sk)));
}

function cleanGloss(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\[\]()]+|[\s\[\](),.;:!?]+$/g, "")
    .trim();
}

function wordCount(s) {
  return cleanGloss(s).split(/\s+/).filter(Boolean).length;
}

function isNameWord(sk) {
  if (!sk) return false;
  if (NAMES.has(sk)) return true;
  if (sk.startsWith("ו") && NAMES.has(sk.slice(1))) return true;
  if (sk.startsWith("ד") && (NAMES.has(sk.slice(1)) || sk.slice(1).startsWith("רב") || sk.slice(1).startsWith("רבי"))) return true;
  if ((sk.startsWith("בר") || sk.startsWith("לר") || sk.startsWith("דר")) && sk.length > 3 && NAMES.has(sk.slice(2))) return true;
  if (NAME_BITS.has(sk)) return true;
  return false;
}

function isHebrewContent(sk) {
  if (!sk) return false;
  if (HEBREW_CONTENT.has(sk)) return true;
  if (sk.startsWith("ו") && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("ה") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("ב") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("ל") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("מ") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("ש") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  if (sk.startsWith("כ") && sk.length > 3 && HEBREW_CONTENT.has(sk.slice(1))) return true;
  return false;
}

function isDroppable(sk) {
  return isNameWord(sk) || isHebrewContent(sk);
}

function stripPrefixes(sk) {
  if (!sk || UNSPLIT.has(sk)) return { prefs: [], base: sk };
  const prefs = [];
  let rest = sk;
  while (prefs.length < 2 && rest.length >= 4 && PREFIX_HE[rest[0]]) {
    if (prefs.length === 1 && !(prefs[0] === "ו" && rest[0] === "ד")) break;
    const next = rest.slice(1);
    if (next.length < 3 || !baseKnown(next)) break;
    prefs.push(rest[0]);
    rest = next;
    if (UNSPLIT.has(rest)) break;
  }
  return { prefs, base: prefs.length ? rest : sk };
}

function splitSurface(surface) {
  const sk = skeleton(surface);
  const { prefs, base } = stripPrefixes(sk);
  if (!prefs.length) return { prefs, base, prefixSurface: "", baseSurface: surface };
  let letters = 0;
  let i = 0;
  const chars = [...surface];
  while (i < chars.length && letters < prefs.length) {
    if (isLetter(chars[i])) letters += 1;
    i += 1;
    if (letters === prefs.length) {
      while (i < chars.length && isNikud(chars[i])) i += 1;
      break;
    }
  }
  return {
    prefs,
    base,
    prefixSurface: chars.slice(0, i).join(""),
    baseSurface: chars.slice(i).join("")
  };
}

function htmlToNodes(html) {
  const nodes = [];
  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*>|([^<]+)/g;
  let m;
  const src = String(html || "");
  while ((m = re.exec(src))) {
    if (m[3] != null) nodes.push({ t: "text", v: decodeEntities(m[3]) });
    else nodes.push({ t: m[1] ? "close" : "open", tag: m[2].toLowerCase() });
  }
  return nodes;
}

function wordsOf(s) {
  return tokenizePlain(s).map((w) => ({ raw: w.surface, sk: w.sk }));
}

function extractGlosses(html) {
  const nodes = htmlToNodes(html);
  const glosses = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].t !== "open" || nodes[i].tag !== "b") continue;
    let phrase = "";
    let j = i + 1;
    for (; j < nodes.length; j++) {
      if (nodes[j].t === "close" && nodes[j].tag === "b") {
        j += 1;
        break;
      }
      if (nodes[j].t === "text") phrase += nodes[j].v;
    }
    let k = j;
    while (k < nodes.length && nodes[k].t === "text" && !nodes[k].v.trim()) k += 1;
    if (k >= nodes.length || !(nodes[k].t === "open" && nodes[k].tag === "small")) {
      i = j - 1;
      continue;
    }
    const bits = [];
    let inSmall = 0;
    let started = false;
    let closed = false;
    for (let p = k; p < nodes.length && !closed; p++) {
      const n = nodes[p];
      if (n.t === "open" && n.tag === "small") {
        inSmall += 1;
        continue;
      }
      if (n.t === "close" && n.tag === "small") {
        inSmall = Math.max(0, inSmall - 1);
        continue;
      }
      if (n.t !== "text") continue;
      let v = n.v;
      if (!started) {
        const idx = v.indexOf("[");
        if (idx < 0) {
          if (v.trim()) break;
          continue;
        }
        v = v.slice(idx + 1);
        started = true;
      }
      const br = v.indexOf("]");
      if (br >= 0) {
        v = v.slice(0, br);
        closed = true;
      }
      if (v) bits.push({ small: inSmall > 0, v });
      if (closed) break;
    }
    if (!started) {
      i = j - 1;
      continue;
    }
    const transBits = [];
    const explainBits = [];
    bits.forEach((bit) => {
      const piece = bit.v.replace(/\s+/g, " ").trim();
      if (!piece) return;
      const connector = !bit.small && /^[ובלמכשהאו]+$/.test(skeleton(piece)) && skeleton(piece).length <= 2;
      if (bit.small || connector) transBits.push(piece);
      else explainBits.push(piece);
    });
    function joinHeb(parts) {
      let out = "";
      parts.forEach((part) => {
        if (!out) out = part;
        else if (part === "ו") out += " ו";
        else if (out.endsWith(" ו")) out += part;
        else out += " " + part;
      });
      return cleanGloss(out);
    }
    const translation = joinHeb(transBits);
    const explanation = joinHeb(explainBits);
    const words = wordsOf(phrase);
    if (!translation || !words.length) {
      i = j - 1;
      continue;
    }
    glosses.push({ words, translation, explanation, phrase: phrase.trim() });
    i = j - 1;
  }
  return glosses;
}

function trimGlossWords(words, translation) {
  const tw = Math.max(1, wordCount(translation));
  if (words.length <= tw) return { words, trimmed: 0 };
  const likely = words.map((w) => isAramaicLikely(w.sk));
  const allLikely = likely.every(Boolean);
  if (allLikely && words.length <= tw + 1) return { words, trimmed: 0 };
  let n = Math.min(words.length, tw);
  let slice = words.slice(words.length - n);
  let guard = 0;
  while (slice.length > 1 && slice.length > tw && isDroppable(slice[0].sk) && guard < 6) {
    slice = slice.slice(1);
    guard += 1;
  }
  return { words: slice, trimmed: words.length - slice.length };
}

function isAramaicLikely(sk) {
  if (!sk || isNameWord(sk)) return false;
  if (UNSPLIT.has(sk) || (AR_SEED.has(sk) && !HEBREW_CONTENT.has(sk))) return true;
  if (isHebrewContent(sk)) return false;
  if (/יהו$|ייהו$|ינן$|נהו$|יתו$|ינא$/.test(sk) && sk.length >= 4) return true;
  const { prefs, base } = stripPrefixes(sk);
  if (prefs.length && (AR_SEED.has(base) || UNSPLIT.has(base))) return true;
  if (prefs.includes("ד") && base.length >= 3 && !isHebrewContent(base)) return true;
  return false;
}

function badTranslation(translation, words) {
  const t = cleanGloss(translation);
  if (!t || lettersOf(t).length < 2) return "empty";
  if (wordCount(t) > 12) return "too-long";
  if (/[\u05D0-\u05EA]{12,}/.test(t)) return "jammed";
  if (/^(ומקשים|ומשיבים|משמע|ללמד|שואלים|מתרצ)/.test(t)) return "commentary";
  if (/ע״|דף |פרק /.test(t)) return "citation";
  const skT = skeleton(t);
  const skP = words.map((w) => w.sk).join("");
  if (skT && skT === skP) return "same-as-word";
  return "";
}

function tokenizePlain(text) {
  const re = /[\u0590-\u05FF״׳"']+/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const surface = m[0];
    const sk = skeleton(surface);
    if (!sk) continue;
    out.push({ surface, sk, start: m.index, end: m.index + surface.length });
  }
  return out;
}

function rowPlain(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<span class="gloss">[\s\S]*?<\/span>/g, " ")
      .replace(/<span class="paren">[\s\S]*?<\/span>/g, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
  ).replace(/\u00a0/g, " ");
}

function neighborChar(text, i, dir) {
  let j = i + dir;
  while (j >= 0 && j < text.length && isNikud(text[j])) j += dir;
  return text[j] || "";
}

function insideQuote(text, start) {
  let open = false;
  for (let i = 0; i < start; i++) {
    const ch = text[i];
    if (ch !== "״" && ch !== '"') continue;
    if (isLetter(neighborChar(text, i, -1)) && isLetter(neighborChar(text, i, 1))) continue;
    open = !open;
  }
  return open;
}

function extractConst(src, name) {
  const re = new RegExp("(?:const|let)\\s+" + name + "\\s*=\\s*");
  const m = re.exec(src);
  if (!m) throw new Error("missing " + name);
  const start = m.index + m[0].length;
  const open = src[start];
  const close = open === "{" ? "}" : open === "[" ? "]" : "";
  if (!close) throw new Error("bad literal " + name);
  let depth = 0;
  let quote = "";
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

function evalLiteral(code) {
  return Function(`"use strict"; return (${code});`)();
}

function hebrewDafNumber(token) {
  const map = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
  let n = 0;
  for (const ch of skeleton(token)) n += map[ch] || 0;
  return n;
}

function dafimFromField(daf) {
  const s = String(daf || "");
  const parts = s.split(/[–—-]/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  let lastNum = 0;
  parts.forEach((part, idx) => {
    const amud = /ע״ב|ע"ב|ב$/.test(part) && !/ע״א|ע"א/.test(part) ? "b" : "a";
    const letters = part.replace(/ע״[אב]|ע"[אב]|[אב]$/g, "").trim();
    let num = hebrewDafNumber(letters);
    if (!num && idx > 0 && lastNum) {
      num = lastNum;
      const side = /ב/.test(part) ? "b" : "a";
      out.push(String(num) + side);
      return;
    }
    if (num) {
      lastNum = num;
      out.push(String(num) + amud);
    }
  });
  if (/ע״א\s*[–—-]\s*ב|ע״א–ב|ע"א-ב/.test(s) && out.length === 1) {
    out.push(out[0].replace(/a$/, "b"));
  }
  return [...new Set(out)];
}

let lastCall = 0;
async function politeFetch(url) {
  const wait = GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" }
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url);
  return res.json();
}

async function cachedJson(file, url) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data;
  try {
    data = await politeFetch(url);
  } catch (err) {
    await sleep(800);
    data = await politeFetch(url);
  }
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

async function loadDaf(daf) {
  const vocalUrl = `${API}/api/v3/texts/Menachot.${daf}?version=${encodeURIComponent("hebrew|William Davidson Edition - Vocalized Aramaic")}`;
  const steinUrl = `${API}/api/v3/texts/Steinsaltz_on_Menachot.${daf}`;
  const vocal = await cachedJson(path.join(CACHE, `menachot-${daf}-vocal.json`), vocalUrl);
  const stein = await cachedJson(path.join(CACHE, `steinsaltz-${daf}.json`), steinUrl);
  const vText = vocal.versions?.[0]?.text;
  const sText = stein.versions?.[0]?.text;
  if (!Array.isArray(vText) || !Array.isArray(sText)) throw new Error("bad payload " + daf);
  const n = Math.max(vText.length, sText.length);
  const segments = [];
  for (let i = 0; i < n; i++) {
    const vocalText = String(vText[i] || "");
    const steinHtml = String(sText[i] || "");
    segments.push({
      daf,
      seg: i + 1,
      ref: `Menachot.${daf}.${i + 1}`,
      vocal: vocalText,
      words: tokenizePlain(vocalText),
      glosses: extractGlosses(steinHtml)
    });
  }
  return segments;
}

function greedyAlign(siteWords, segWords) {
  const map = [];
  let j = 0;
  for (const w of siteWords) {
    let found = -1;
    const near = Math.min(segWords.length, j + 10);
    for (let k = j; k < near; k++) {
      if (sameWord(w.sk, segWords[k].sk)) {
        found = k;
        break;
      }
    }
    if (found < 0) {
      const far = Math.min(segWords.length, j + 30);
      for (let k = j; k < far; k++) {
        if (w.sk === segWords[k].sk) {
          found = k;
          break;
        }
      }
    }
    map.push(found);
    if (found >= 0) j = found + 1;
  }
  return map;
}

function findPhrases(segWords, phraseWords, preferFrom, preferTo) {
  const hits = [];
  for (let i = 0; i < segWords.length; i++) {
    let ok = true;
    const idx = [];
    let k = i;
    for (const pw of phraseWords) {
      let found = -1;
      const limit = Math.min(segWords.length, k + 3);
      for (let t = k; t < limit; t++) {
        if (sameWord(pw.sk, segWords[t].sk) || pw.sk === segWords[t].sk) {
          found = t;
          break;
        }
      }
      if (found < 0) {
        ok = false;
        break;
      }
      idx.push(found);
      k = found + 1;
    }
    if (!ok) continue;
    const start = idx[0];
    const end = idx[idx.length - 1];
    let score = 0;
    if (start >= preferFrom - 2 && end <= preferTo + 2) score += 5;
    if (end - start === phraseWords.length - 1) score += 2;
    phraseWords.forEach((pw, n) => {
      if (pw.sk === segWords[idx[n]].sk) score += 1;
    });
    hits.push({ idx, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits;
}

function inlineAnchors(html) {
  const anchors = [];
  const re = /<span class="gloss">\s*\[([\s\S]*?)\]\s*<\/span>/g;
  let m;
  while ((m = re.exec(String(html || "")))) {
    const before = rowPlain(html.slice(0, m.index)).replace(/\s+$/, "");
    const wm = before.match(/([\u0590-\u05FF״׳"']+(?:[\s\u00A0]+[\u0590-\u05FF״׳"']+){0,2})[?!.,;:]?\s*$/);
    if (!wm) continue;
    let words = wordsOf(wm[1]);
    while (words.length > 1 && isNameWord(words[0].sk)) words = words.slice(1);
    if (!words.length) continue;
    anchors.push({ he: cleanGloss(m[1]), words, endAt: before.length });
  }
  return anchors;
}

function handEntries(aramaic, extra, id, rowHtmls) {
  const out = [];
  const seen = new Set();
  function add(list, source) {
    (list || []).forEach((w) => {
      const ar = String(w?.ar || "").trim();
      const he = String(w?.he || "").trim();
      const words = wordsOf(ar);
      const key = ar;
      if (!words.length || !he || seen.has(key)) return;
      if (skeleton(ar).length < 2 && words.length < 2) return;
      seen.add(key);
      out.push({ ar, he, key, source, words, order: out.length });
    });
  }
  add(aramaic[id], "hand");
  Object.keys(aramaic).forEach((k) => add(aramaic[k], "hand"));
  add(extra, "hand");
  out.sort((a, b) => b.ar.length - a.ar.length);
  return out;
}

function vocalKey(s) {
  return [...String(s || "")].filter((ch) => isLetter(ch) || isNikud(ch)).join("");
}

function findContiguous(siteWords, phraseWords) {
  const hits = [];
  for (let i = 0; i < siteWords.length; i++) {
    let ok = true;
    for (let n = 0; n < phraseWords.length; n++) {
      const sw = siteWords[i + n];
      const pw = phraseWords[n];
      if (!sw || sw.sk !== pw.sk) {
        ok = false;
        break;
      }
      if (sw.sk.length <= 3 && vocalKey(sw.surface) !== vocalKey(pw.raw)) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function snippet(text, start, end) {
  const a = Math.max(0, start - 18);
  const b = Math.min(text.length, end + 18);
  return text.slice(a, b).replace(/\s+/g, " ").trim();
}

function rootFor(base) {
  return ROOTS[base] || "";
}

function lemmaIdOf(base) {
  return base || "";
}

async function jastrow(word) {
  const sk = skeleton(word);
  if (!sk || sk.length < 2) return null;
  const file = path.join(CACHE, "words", sk + ".json");
  const url = `${API}/api/words/${encodeURIComponent(sk)}`;
  let data;
  try {
    data = await cachedJson(file, url);
  } catch (err) {
    return null;
  }
  if (!Array.isArray(data)) return null;
  let best = null;
  for (const item of data) {
    const hw = String(item.headword || "");
    const lang = String(item.language_code || "");
    const hwSk = skeleton(hw);
    if (!hwSk) continue;
    const arc = /arc|ch/i.test(lang) || /ארמ|כלד/.test(JSON.stringify(item.content || {}).slice(0, 400));
    const close = hwSk === sk || sameWord(hwSk, sk);
    if (!close && !arc) continue;
    const senses = item.content?.senses || [];
    let en = "";
    if (senses[0]?.definition) {
      en = String(senses[0].definition).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    }
    const score = (hwSk === sk ? 5 : 0) + (arc ? 3 : 0) + (close ? 2 : 0);
    if (!best || score > best.score) best = { headword: hw, lang: lang.trim(), en, score, hwSk };
  }
  return best;
}

function baseGlossFrom(singleMap, base, ctx) {
  if (singleMap[base]) return singleMap[base];
  return "";
}

function makePrefixNote(surface, ctxGloss, baseGloss) {
  const split = splitSurface(surface);
  if (!split.prefs.length) return { prefix: "", prefixGloss: "", note: "", base: skeleton(surface) };
  if (split.prefs.length === 1 && split.prefs[0] === "ו") {
    return { prefix: "ו", prefixGloss: "ו", note: "", base: split.base };
  }
  const glosses = split.prefs.map((p) => PREFIX_HE[p] || p);
  let baseHe = baseGloss || "";
  if (split.prefs.length === 1 && split.prefs[0] === "ד" && ctxGloss && ctxGloss.startsWith("ש")) {
    const rest = cleanGloss(ctxGloss.slice(1));
    if (rest && wordCount(rest) <= 4 && lettersOf(rest).length >= 2) baseHe = rest;
  }
  if (!baseHe || !baseKnown(split.base)) {
    return { prefix: split.prefs.join(""), prefixGloss: glosses.join(" + "), note: "", base: split.base };
  }
  if (wordCount(baseHe) > 4) {
    return { prefix: split.prefs.join(""), prefixGloss: glosses.join(" + "), note: "", base: split.base };
  }
  const baseShow = skeleton(split.baseSurface) || split.base;
  const left = split.prefixSurface || split.prefs.join("");
  const mid = glosses.join(" + ");
  return { prefix: split.prefs.join(""), prefixGloss: mid, note: `${left} = ${mid} + ${baseShow} = ${baseHe}`, base: split.base };
}

function usefulPrefix(note, surfaceWords) {
  if (!note) return "";
  if (surfaceWords > 2) return "";
  return note;
}

function oldCoveredRanges(plain, pairs) {
  const ranges = [];
  const sorted = pairs.slice().sort((a, b) => b.ar.length - a.ar.length);
  sorted.forEach((pair) => {
    if (lettersOf(pair.ar).length < 3) return;
    let from = 0;
    while (from < plain.length) {
      const idx = plain.indexOf(pair.ar, from);
      if (idx < 0) break;
      const end = idx + pair.ar.length;
      const after = plain[end] || "";
      const beforeCh = plain[idx - 1] || "";
      const letterAfter = isLetter(after);
      const letterBefore = isLetter(beforeCh);
      if (!letterAfter && !letterBefore) ranges.push([idx, end]);
      from = end;
    }
  });
  return ranges;
}

function inlineRanges(html, plain) {
  const ranges = [];
  const re = /<span class="gloss">\s*\[[\s\S]*?\]\s*<\/span>/g;
  let m;
  const stripped = String(html || "");
  while ((m = re.exec(stripped))) {
    const beforeHtml = stripped.slice(0, m.index);
    const beforePlain = rowPlain(beforeHtml);
    const wm = beforePlain.match(/([\u0590-\u05FF״׳"']+(?:[\s\u00A0]+[\u0590-\u05FF״׳"']+){0,2})[?!.,;:]?\s*$/);
    if (!wm) continue;
    const surface = wm[1];
    const at = beforePlain.lastIndexOf(surface);
    if (at < 0) continue;
    ranges.push([at, at + surface.length]);
  }
  return ranges;
}

function countCovered(words, ranges) {
  let n = 0;
  words.forEach((w) => {
    if (ranges.some(([a, b]) => w.start >= a && w.end <= b)) n += 1;
  });
  return n;
}

function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  sorted.forEach((r) => {
    const last = out[out.length - 1];
    if (!last || r[0] > last[1]) out.push(r.slice());
    else last[1] = Math.max(last[1], r[1]);
  });
  return out;
}

function classifyWord(sk, inQuote) {
  if (inQuote) return "hebrew";
  if (isNameWord(sk)) return "name";
  if (isAramaicLikely(sk) && !isHebrewContent(sk)) return "aramaic";
  if (isHebrewContent(sk)) return "hebrew";
  if (isAramaicLikely(sk)) return "aramaic";
  return "hebrew";
}

async function main() {
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sugyot = evalLiteral(extractConst(index, "SUGYOT"));
  const aramaic = evalLiteral(extractConst(index, "ARAMAIC"));
  const extra = evalLiteral(extractConst(index, "GLOSS_EXTRA"));
  const literal = evalLiteral(extractConst(index, "LITERAL"));
  const handSingle = {};
  literal.forEach((w) => {
    const parts = wordsOf(String(w?.ar || ""));
    const he = cleanGloss(w?.he || "");
    if (parts.length === 1 && he && !handSingle[parts[0].sk]) handSingle[parts[0].sk] = he;
  });
  const refsFile = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sugya-refs.json"), "utf8"));
  const corrections = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "corrections.json"), "utf8"));
  const ids = Object.keys(sugyot).filter((id) => Array.isArray(sugyot[id]?.rows));

  const dafSet = new Set();
  const sugyaDafim = {};
  ids.forEach((id) => {
    const listed = Array.isArray(refsFile[id]) ? refsFile[id] : dafimFromField(sugyot[id].daf);
    sugyaDafim[id] = listed;
    listed.forEach((d) => dafSet.add(d));
  });
  if (!dafSet.size) throw new Error("no dafim");

  const byDaf = {};
  for (const daf of dafSet) {
    process.stderr.write("daf " + daf + "\n");
    byDaf[daf] = await loadDaf(daf);
  }

  const singleGloss = {};
  Object.values(byDaf).forEach((segs) => {
    segs.forEach((seg) => {
      seg.glosses.forEach((g) => {
        const trimmed = trimGlossWords(g.words, g.translation);
        if (trimmed.words.length === 1 && !badTranslation(g.translation, trimmed.words)) {
          const sk = trimmed.words[0].sk;
          const { base } = stripPrefixes(sk);
          if (!singleGloss[sk]) singleGloss[sk] = g.translation;
          if (base && !singleGloss[base] && base !== sk) {
            const { prefs } = stripPrefixes(sk);
            if (prefs.length === 1 && g.translation.startsWith(PREFIX_HE[prefs[0]] || "§")) {
              const rest = cleanGloss(g.translation.slice((PREFIX_HE[prefs[0]] || "").length));
              if (rest && wordCount(rest) <= 3) singleGloss[base] = rest;
            }
          }
          // Steinsaltz bolds Hebrew as well as Aramaic. Do not let that
          // pull Hebrew words into the Aramaic count.
        }
      });
    });
  });
  Object.keys(singleGloss).forEach((k) => KNOWN_BASE.add(k));

  const dictionary = new Map();
  function upsertLemma(base, gloss, source) {
    if (!base) return;
    const id = lemmaIdOf(base);
    let row = dictionary.get(id);
    if (!row) {
      row = {
        id,
        lemma: base,
        root: rootFor(base),
        gloss_he: gloss || "",
        phrases: [],
        sources: []
      };
      dictionary.set(id, row);
    }
    if (gloss && (!row.gloss_he || source === "hand" || source === "teacher")) row.gloss_he = gloss;
    if (source && !row.sources.includes(source)) row.sources.push(source);
  }
  function addPhrase(base, ar, gloss, source) {
    upsertLemma(base, "", source);
    const row = dictionary.get(lemmaIdOf(base));
    if (!row) return;
    const key = skeleton(ar);
    if (!row.phrases.some((p) => skeleton(p.ar) === key)) {
      row.phrases.push({ ar, gloss_he: gloss, sources: [source] });
    } else {
      const p = row.phrases.find((x) => skeleton(x.ar) === key);
      if (source === "hand" || source === "teacher") p.gloss_he = gloss;
      if (!p.sources.includes(source)) p.sources.push(source);
    }
  }

  const review = [];
  const sugyaOut = {};
  const reportSugyot = [];
  const samples = [];

  function pushReview(item) {
    review.push(item);
  }

  for (const id of ids) {
    const sugya = sugyot[id];
    const segments = sugyaDafim[id].flatMap((d) => byDaf[d] || []);
    const hands = handEntries({ dict: literal }, [], "dict", []);
    const tokens = [];
    let wordTotal = 0;
    let aramaicN = 0;
    let hebrewN = 0;
    let nameN = 0;
    let beforeRangesN = 0;
    const afterRanges = [];

    sugya.rows.forEach((row, rowIndex) => {
      const plain = rowPlain(row.html);
      const siteWords = tokenizePlain(plain);
      wordTotal += siteWords.length;
      siteWords.forEach((w) => {
        const kind = classifyWord(w.sk, insideQuote(plain, w.start, w.end));
        if (kind === "aramaic") aramaicN += 1;
        else if (kind === "name") nameN += 1;
        else hebrewN += 1;
      });

      const candidates = [];
      function pushHand(words, he, start, anchor) {
        const endWord = siteWords[start + words.length - 1];
        const first = siteWords[start];
        if (!endWord || !first) return;
        if (insideQuote(plain, first.start)) return;
        candidates.push({
          start: first.start,
          end: endWord.end,
          surface: plain.slice(first.start, endWord.end),
          ctxGloss: he,
          explain: "",
          confidence: 1,
          source: "hand",
          anchor: !!anchor,
          order: 0,
          words,
          siteFrom: start,
          siteTo: start + words.length - 1,
          lemmaBase: stripPrefixes(words[words.length - 1].sk).base
        });
      }
      hands.forEach((h) => {
        findContiguous(siteWords, h.words).forEach((start) => {
          pushHand(h.words, h.he, start, false);
          const last = candidates[candidates.length - 1];
          if (last && last.ctxGloss === h.he) last.order = h.order || 0;
        });
        if (!h.ar || lettersOf(h.ar).length < 2) return;
        let from = 0;
        while (from < plain.length) {
          const idx = plain.indexOf(h.ar, from);
          if (idx < 0) break;
          const end = idx + h.ar.length;
          let beforeAt = idx - 1;
          while (beforeAt >= 0 && isNikud(plain[beforeAt])) beforeAt -= 1;
          let afterAt = end;
          while (afterAt < plain.length && isNikud(plain[afterAt])) afterAt += 1;
          const beforeCh = plain[beforeAt] || "";
          const afterCh = plain[afterAt] || "";
          if (!isLetter(beforeCh) && !isLetter(afterCh)) {
            const overlapping = [];
            siteWords.forEach((w, n) => {
              if (w.start >= idx && w.end <= end) overlapping.push(n);
            });
            const siteFrom = overlapping.length ? overlapping[0] : 0;
            const siteTo = overlapping.length ? overlapping[overlapping.length - 1] : siteFrom;
            candidates.push({
              start: idx,
              end,
              surface: plain.slice(idx, end),
              ctxGloss: h.he,
              explain: "",
              confidence: 1,
              source: "hand",
              anchor: false,
              order: h.order || 0,
              words: h.words,
              siteFrom,
              siteTo,
              lemmaBase: stripPrefixes((h.words[h.words.length - 1] || {}).sk || "").base
            });
          }
          from = end;
        }
      });
      inlineAnchors(row.html).forEach((h) => {
        let best = null;
        findContiguous(siteWords, h.words).forEach((start) => {
          const endWord = siteWords[start + h.words.length - 1];
          const dist = Math.abs(endWord.end - h.endAt);
          if (!best || dist < best.dist) best = { start, dist };
        });
        if (best && best.dist <= 3) pushHand(h.words, h.he, best.start, true);
      });
      siteWords.forEach((w, idx) => {
        if (insideQuote(plain, w.start) || isNameWord(w.sk) || isHebrewContent(w.sk)) return;
        if (singleGloss[w.sk]) return;
        const split = stripPrefixes(w.sk);
        if (split.prefs.length !== 1 || !baseKnown(split.base) || isHebrewContent(split.base)) return;
        const baseHe = singleGloss[split.base];
        if (!baseHe || wordCount(baseHe) > 3) return;
        const p = split.prefs[0];
        if ("דבלומ".indexOf(p) < 0) return;
        const ctx = p === "ד" ? "ש" + baseHe.replace(/^ש/, "") : p === "ו" ? "ו" + baseHe.replace(/^ו/, "") : baseHe;
        candidates.push({
          start: w.start,
          end: w.end,
          surface: w.surface,
          ctxGloss: ctx,
          explain: "",
          confidence: 0.86,
          source: "steinsaltz",
          anchor: false,
          words: [{ raw: w.surface, sk: w.sk }],
          siteFrom: idx,
          siteTo: idx,
          lemmaBase: split.base
        });
      });

      let align = null;
      if (siteWords.length && segments.length) {
        let best = null;
        for (const seg of segments) {
          const map = greedyAlign(siteWords, seg.words);
          const matched = map.filter((x) => x >= 0).length;
          const score = matched / siteWords.length;
          if (!best || score > best.score) best = { score, map, seg };
        }
        align = best;
      }
      if (align && align.score < 0.4 && siteWords.length > 8) {
        pushReview({
          sugya: id,
          row: rowIndex,
          surface: plain.slice(0, 42),
          context: plain.slice(0, 80),
          proposed: "",
          explain: "",
          confidence: Number(align.score.toFixed(2)),
          reason: "row-align-weak",
          lemmaId: ""
        });
      }
      if (align && align.score >= 0.55) {
        const mapped = align.map.filter((x) => x >= 0);
        const preferFrom = mapped.length ? Math.min(...mapped) : 0;
        const preferTo = mapped.length ? Math.max(...mapped) : 0;
        align.seg.glosses.forEach((g) => {
          const trimmed = trimGlossWords(g.words, g.translation);
          if (!trimmed.words.length) return;
          if (trimmed.words.every((w) => isNameWord(w.sk) || isHebrewContent(w.sk))) return;
          const hits = findPhrases(align.seg.words, trimmed.words, preferFrom, preferTo).filter((hit) =>
            hit.idx.some((i) => i >= preferFrom - 3 && i <= preferTo + 3)
          );
          hits.forEach((hit) => {
            const why = badTranslation(g.translation, trimmed.words);
            const surfaceGuess = trimmed.words.map((w) => w.raw).join(" ");
            if (why) {
              if (why === "too-long" || why === "jammed") {
                pushReview({
                  sugya: id,
                  row: rowIndex,
                  surface: surfaceGuess,
                  context: snippet(plain, 0, 70),
                  proposed: g.translation,
                  explain: g.explanation,
                  confidence: 0.45,
                  reason: why,
                  lemmaId: stripPrefixes(trimmed.words[trimmed.words.length - 1].sk).base
                });
              }
              return;
            }
            const siteIdx = hit.idx.map((segIdx) => align.map.indexOf(segIdx));
            if (siteIdx.some((n) => n < 0)) return;
            const sorted = siteIdx.slice().sort((a, b) => a - b);
            if (sorted[sorted.length - 1] - sorted[0] !== sorted.length - 1) {
              pushReview({
                sugya: id,
                row: rowIndex,
                surface: surfaceGuess,
                context: snippet(plain, siteWords[sorted[0]].start, siteWords[sorted[sorted.length - 1]].end),
                proposed: g.translation,
                explain: g.explanation,
                confidence: 0.6,
                reason: "alignment-gap",
                lemmaId: stripPrefixes(trimmed.words[trimmed.words.length - 1].sk).base
              });
              return;
            }
            const a = siteWords[sorted[0]];
            const b = siteWords[sorted[sorted.length - 1]];
            if (insideQuote(plain, a.start)) return;
            let conf = 0.93;
            const fuzzy = trimmed.words.some((w, n) => w.sk !== align.seg.words[hit.idx[n]].sk);
            if (fuzzy) conf -= 0.06;
            if (trimmed.trimmed) conf -= 0.03;
            if (align.score < 0.75) conf -= 0.05;
            candidates.push({
              start: a.start,
              end: b.end,
              surface: plain.slice(a.start, b.end),
              ctxGloss: g.translation,
              explain: wordCount(g.explanation) > 0 && wordCount(g.explanation) <= 8 ? g.explanation : "",
              confidence: Number(Math.max(0, conf).toFixed(2)),
              source: "steinsaltz",
              anchor: false,
              words: trimmed.words,
              siteFrom: sorted[0],
              siteTo: sorted[sorted.length - 1],
              lemmaBase: stripPrefixes(trimmed.words[trimmed.words.length - 1].sk).base
            });
          });
        });
      }

      candidates.sort((a, b) => {
        const ah = a.source === "hand" ? 0 : 1;
        const bh = b.source === "hand" ? 0 : 1;
        if (ah !== bh) return ah - bh;
        const len = b.end - b.start - (a.end - a.start);
        if (len) return len;
        if (!!b.anchor !== !!a.anchor) return (b.anchor ? 1 : 0) - (a.anchor ? 1 : 0);
        if ((a.order || 0) !== (b.order || 0)) return (a.order || 0) - (b.order || 0);
        return b.confidence - a.confidence;
      });
      const kept = [];
      candidates.forEach((c) => {
        if (kept.some((k) => !(c.end <= k.start || c.start >= k.end))) return;
        kept.push(c);
      });
      kept.sort((a, b) => a.start - b.start);
      const seenSurface = {};
      kept.forEach((c) => {
        const key = c.surface;
        const occurrence = seenSurface[key] || 0;
        seenSurface[key] = occurrence + 1;
        const firstSurface = (siteWords[c.siteFrom] && siteWords[c.siteFrom].start >= c.start)
          ? siteWords[c.siteFrom].surface
          : ((tokenizePlain(c.surface)[0] || {}).surface || c.surface);
        const baseGloss = baseGlossFrom(singleGloss, stripPrefixes(skeleton(firstSurface)).base, c.ctxGloss);
        const pref = makePrefixNote(firstSurface, c.words.length === 1 ? c.ctxGloss : "", baseGloss);
        const note = usefulPrefix(pref.note, c.words.length);
        if (c.source !== "hand" && c.source !== "teacher") return;
        const lemmaKey = c.lemmaBase || pref.base;
        const lemmaGloss = c.words.length === 1 ? c.ctxGloss : (handSingle[lemmaKey] || "");
        const show = true;
        const token = {
          surface: c.surface,
          prefix: pref.prefix,
          lemmaId: lemmaIdOf(c.lemmaBase || pref.base),
          ctxGloss: c.ctxGloss,
          confidence: c.source === "hand" ? 1 : c.confidence,
          row: rowIndex,
          occurrence,
          base: c.lemmaBase || pref.base,
          prefixGloss: pref.prefixGloss,
          prefixNote: note,
          explain: c.explain || "",
          source: c.source,
          start: c.start,
          end: c.end
        };
        if (!show) {
          pushReview({
            sugya: id,
            row: rowIndex,
            surface: c.surface,
            context: snippet(plain, c.start, c.end),
            proposed: c.ctxGloss,
            explain: c.explain || "",
            confidence: c.confidence,
            reason: c.fuzzy ? "fuzzy-align" : c.trimmed ? "trimmed-phrase" : "low-confidence",
            lemmaId: token.lemmaId
          });
          return;
        }
        tokens.push(token);
        afterRanges.push([c.start, c.end]);
        const glossSrc = c.source === "hand" ? "hand" : "steinsaltz";
        upsertLemma(token.base, lemmaGloss, glossSrc);
        if (c.words.length > 1) addPhrase(token.base, skeleton(c.surface), c.ctxGloss, glossSrc);
        if (samples.length < 40) {
          samples.push({
            sugya: id,
            surface: token.surface,
            ctxGloss: token.ctxGloss,
            explain: token.explain,
            prefixNote: token.prefixNote,
            source: token.source,
            confidence: token.confidence
          });
        }
      });

      const inline = inlineRanges(row.html, plain);
      const oldPairs = [];
      const seenOld = {};
      function addOld(list) {
        (list || []).forEach((w) => {
          const ar = String(w?.ar || "").trim();
          const he = String(w?.he || "").trim();
          if (!ar || !he || seenOld[ar]) return;
          if (lettersOf(ar).length < 3) return;
          seenOld[ar] = true;
          oldPairs.push({ ar, he });
        });
      }
      addOld(aramaic[id]);
      Object.keys(aramaic).forEach((k) => addOld(aramaic[k]));
      addOld(extra);
      const before = mergeRanges(oldCoveredRanges(plain, oldPairs).concat(inline));
      beforeRangesN += countCovered(siteWords, before);
      inline.forEach((r) => afterRanges.push(r));
    });

    const coveredAfter = countCovered(
      sugya.rows.flatMap((row) => tokenizePlain(rowPlain(row.html))),
      mergeRanges(afterRanges)
    );
    // coveredAfter double-counts rows because afterRanges is global and words are re-tokenized
    // without row offsets. Recompute properly:
    let afterN = 0;
    let beforeN = 0;
    let aramaicGlossedBefore = 0;
    let aramaicGlossedAfter = 0;
    sugya.rows.forEach((row, rowIndex) => {
      const plain = rowPlain(row.html);
      const siteWords = tokenizePlain(plain);
      const inline = inlineRanges(row.html, plain);
      const oldPairs = [];
      const seenOld = {};
      function addOld(list) {
        (list || []).forEach((w) => {
          const ar = String(w?.ar || "").trim();
          const he = String(w?.he || "").trim();
          if (!ar || !he || seenOld[ar]) return;
          if (lettersOf(ar).length < 3) return;
          seenOld[ar] = true;
          oldPairs.push({ ar, he });
        });
      }
      addOld(aramaic[id]);
      Object.keys(aramaic).forEach((k) => addOld(aramaic[k]));
      addOld(extra);
      const before = mergeRanges(oldCoveredRanges(plain, oldPairs).concat(inline));
      const mine = tokens.filter((t) => t.row === rowIndex).map((t) => [t.start, t.end]);
      const after = mergeRanges(mine.concat(inline));
      siteWords.forEach((w) => {
        const kind = classifyWord(w.sk, insideQuote(plain, w.start, w.end));
        const b = before.some(([a, z]) => w.start >= a && w.end <= z);
        const a = after.some(([s, z]) => w.start >= s && w.end <= z);
        if (b) beforeN += 1;
        if (a) afterN += 1;
        if (kind === "aramaic" && b) aramaicGlossedBefore += 1;
        if (kind === "aramaic" && a) aramaicGlossedAfter += 1;
      });
    });

    sugyaOut[id] = {
      sugya: id,
      title: sugya.title,
      daf: sugya.daf,
      refs: sugyaDafim[id].map((d) => "Menachot." + d),
      tokens
    };
    reportSugyot.push({
      id,
      title: sugya.title,
      words: wordTotal,
      aramaic: aramaicN,
      hebrew: hebrewN,
      names: nameN,
      beforeGlossed: beforeN,
      afterGlossed: afterN,
      beforePct: wordTotal ? Math.round((beforeN / wordTotal) * 1000) / 10 : 0,
      afterPct: wordTotal ? Math.round((afterN / wordTotal) * 1000) / 10 : 0,
      aramaicBeforePct: aramaicN ? Math.round((aramaicGlossedBefore / aramaicN) * 1000) / 10 : 0,
      aramaicAfterPct: aramaicN ? Math.round((aramaicGlossedAfter / aramaicN) * 1000) / 10 : 100,
      tokens: tokens.length
    });
    void beforeRangesN;
  }

  const corrItems = Array.isArray(corrections.items) ? corrections.items : [];
  corrItems.forEach((c) => {
    const pack = sugyaOut[c.sugya];
    if (!pack || !c.surface) return;
    const sk = skeleton(c.surface);
    const hit = pack.tokens.find((t) => skeleton(t.surface) === sk && (c.row == null || t.row === c.row));
    if (c.hide) {
      if (hit) pack.tokens = pack.tokens.filter((t) => t !== hit);
      return;
    }
    if (hit && c.ctxGloss) {
      hit.ctxGloss = c.ctxGloss;
      if (typeof c.explain === "string") hit.explain = c.explain;
      hit.confidence = 1;
      hit.source = "teacher";
      upsertLemma(hit.base, c.ctxGloss, "teacher");
    }
  });

  const bases = new Set();
  Object.values(sugyaOut).forEach((pack) => {
    pack.tokens.forEach((t) => {
      if (t.base) bases.add(t.base);
    });
  });
  let looked = 0;
  for (const base of bases) {
    if (looked > 180) break;
    const info = await jastrow(base);
    looked += 1;
    const row = dictionary.get(base);
    if (!row) continue;
    if (info?.headword) {
      row.lemma = skeleton(info.headword) === base ? info.headword.replace(/[^\u0590-\u05FF]/g, "") : row.lemma;
      if (!row.sources.includes("jastrow")) row.sources.push("jastrow");
      row.jastrow = { headword: info.headword, language: info.lang || "" };
      if (!row.root) row.root = rootFor(base);
    }
  }

  const unglossedParticles = [];
  ids.forEach((id) => {
    const pack = sugyaOut[id];
    sugyot[id].rows.forEach((row, rowIndex) => {
      const plain = rowPlain(row.html);
      const words = tokenizePlain(plain);
      words.forEach((w) => {
        if (w.sk.length < 3 || !isAramaicLikely(w.sk) || isHebrewContent(w.sk)) return;
        if (insideQuote(plain, w.start, w.end)) return;
        const base = stripPrefixes(w.sk).base;
        if (!singleGloss[w.sk] && !singleGloss[base]) return;
        const covered = pack.tokens.some((t) => t.row === rowIndex && w.start >= t.start && w.end <= t.end);
        if (covered) return;
        unglossedParticles.push({ sk: w.sk, surface: w.surface, sugya: id, row: rowIndex, context: snippet(plain, w.start, w.end) });
      });
    });
  });
  const seenGap = new Set();
  for (const gap of unglossedParticles) {
    const key = gap.sugya + ":" + gap.sk;
    if (seenGap.has(key)) continue;
    seenGap.add(key);
    if (seenGap.size > 40) break;
    let en = "";
    const info = await jastrow(gap.sk);
    if (info?.en) en = info.en;
    pushReview({
      sugya: gap.sugya,
      row: gap.row,
      surface: gap.surface,
      context: gap.context,
      proposed: "",
      explain: "",
      confidence: 0.35,
      reason: en ? "unglossed-aramaic" : "unglossed-aramaic",
      lemmaId: stripPrefixes(gap.sk).base,
      jastrow_en: en
    });
  }

  const lemmas = [...dictionary.values()]
    .filter((row) => row.gloss_he || row.phrases.length)
    .sort((a, b) => a.id.localeCompare(b.id, "he"));
  lemmas.forEach((row) => {
    if (!row.root) row.root = rootFor(skeleton(row.lemma)) || rootFor(row.id) || "";
    row.phrases.sort((a, b) => b.ar.length - a.ar.length);
  });

  const dictPath = path.join(ROOT, "data", "dictionary.json");
  fs.writeFileSync(
    dictPath,
    JSON.stringify(
      {
        license: "CC-BY-NC",
        credit: "ביאור שטיינזלץ, תלמוד מהדורת ויליאם דוידסון, ספריא. ערכים ידניים גוברים.",
        generated: new Date().toISOString(),
        lemmas
      },
      null,
      2
    )
  );

  const sugyaDir = path.join(ROOT, "data", "sugyot");
  fs.mkdirSync(sugyaDir, { recursive: true });
  ids.forEach((id) => {
    fs.writeFileSync(path.join(sugyaDir, id + ".json"), JSON.stringify(sugyaOut[id], null, 2));
  });

  const reviewDedup = [];
  const seenR = new Set();
  review.forEach((item) => {
    const key = [item.sugya, item.reason, skeleton(item.surface), item.proposed].join("|");
    if (seenR.has(key)) return;
    seenR.add(key);
    reviewDedup.push(item);
  });
  fs.writeFileSync(
    path.join(ROOT, "data", "review.json"),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        showThreshold: SHOW_AT,
        count: reviewDedup.length,
        items: reviewDedup
      },
      null,
      2
    )
  );

  const bundle = {
    generated: new Date().toISOString(),
    credit: "ביאור שטיינזלץ, תלמוד מהדורת ויליאם דוידסון (ספריא), CC-BY-NC",
    sugyot: {}
  };
  ids.forEach((id) => {
    bundle.sugyot[id] = {
      tokens: sugyaOut[id].tokens.map((t) => ({
        row: t.row,
        occurrence: t.occurrence,
        surface: t.surface,
        ctxGloss: t.ctxGloss,
        explain: t.explain,
        prefixNote: t.prefixNote,
        confidence: t.confidence,
        source: t.source,
        lemmaId: t.lemmaId,
        prefix: t.prefix
      }))
    };
  });
  fs.writeFileSync(
    path.join(ROOT, "data", "lexicon.js"),
    "/* generated by scripts/build-lexicon.mjs — do not edit */\nwindow.LEXICON = " + JSON.stringify(bundle) + ";\n"
  );

  const allTokens = [];
  Object.entries(sugyaOut).forEach(([id, pack]) => {
    pack.tokens.forEach((t) => allTokens.push({ sugya: id, ...t }));
  });
  const sample15 = [];
  const take = (fn) => {
    const hit = allTokens.find((s) => fn(s) && !sample15.includes(s));
    if (hit) sample15.push(hit);
  };
  take((s) => s.prefixNote && s.prefixNote.includes("ש +") && s.ctxGloss.indexOf("ש") === 0);
  take((s) => s.surface && skeleton(s.surface) === "איני");
  take((s) => s.explain);
  take((s) => s.source === "steinsaltz" && skeleton(s.surface) === "בריה");
  take((s) => s.source === "hand" && s.surface.split(/\s+/).length > 1 && s.ctxGloss.length < 24);
  take((s) => skeleton(s.surface) === "דאמרי תרוייהו" || skeleton(s.surface).includes("תרוייהו"));
  ids.forEach((id) => take((s) => s.sugya === id && (s.prefixNote || s.source === "steinsaltz" || s.explain)));
  for (const s of allTokens) {
    if (sample15.length >= 15) break;
    if (!sample15.includes(s)) sample15.push(s);
  }

  const report = {
    generated: new Date().toISOString(),
    showThreshold: SHOW_AT,
    review: reviewDedup.length,
    lemmas: lemmas.length,
    sugyot: reportSugyot,
    samples: sample15.slice(0, 15),
    totals: reportSugyot.reduce(
      (acc, row) => {
        acc.words += row.words;
        acc.aramaic += row.aramaic;
        acc.hebrew += row.hebrew;
        acc.names += row.names;
        acc.before += row.beforeGlossed;
        acc.after += row.afterGlossed;
        return acc;
      },
      { words: 0, aramaic: 0, hebrew: 0, names: 0, before: 0, after: 0 }
    )
  };
  fs.writeFileSync(path.join(ROOT, "data", "report.json"), JSON.stringify(report, null, 2));
  const ini = (sugyaOut.a.tokens || []).find((t) => skeleton(t.surface) === "איני");
  if (!ini || ini.ctxGloss !== "וכי כך") {
    console.error("hand gloss for איני was overwritten", ini);
    process.exit(1);
  }
  if (report.totals.after < report.totals.before) {
    console.error("coverage went down", report.totals);
    process.exit(1);
  }
  const suspicious = [];
  Object.values(sugyaOut).forEach((pack) => {
    pack.tokens.forEach((t) => {
      if (t.source !== "steinsaltz") return;
      const parts = tokenizePlain(t.surface);
      if (parts.length === 1 && isHebrewContent(parts[0].sk)) suspicious.push(pack.sugya + " " + t.surface + " = " + t.ctxGloss);
    });
  });
  if (suspicious.length) process.stderr.write("hebrew-looking automatic glosses:\n" + suspicious.slice(0, 30).join("\n") + "\n");
  process.stdout.write(JSON.stringify({ review: report.review, lemmas: report.lemmas, totals: report.totals, sugyot: report.sugyot.map((s) => ({ id: s.id, words: s.words, ar: s.aramaic, he: s.hebrew, names: s.names, before: s.beforePct, after: s.afterPct, arBefore: s.aramaicBeforePct, arAfter: s.aramaicAfterPct, tokens: s.tokens })) }, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
