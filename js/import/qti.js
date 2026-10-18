// Import questions from Common Cartridge / QTI 1.2 zips: Schoology exports
// (.imscc), Canvas-style packages from text2qti, and assessor's own exports.
// Each assessment (quiz or question bank) in the file becomes a bank.

import { newChoice, newId, newQuestion, parseNumber } from '../model.js';
import { readZip } from './unzip.js';
import { htmlToInline, htmlToText } from './html2text.js';

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' };

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('A file inside the package isn’t valid XML.');
  return doc;
}

// Elements by local name (namespaces differ between producers).
const all = (el, name) => [...el.getElementsByTagNameNS('*', name)];
const first = (el, name) => all(el, name)[0] ?? null;
const childrenNamed = (el, name) => [...el.children].filter((c) => c.localName === name);

function bytesToDataUrl(bytes, mime) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

function resolvePath(base, rel) {
  const parts = (base ? `${base}/${rel}` : rel).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

function metaField(item, label) {
  const f = all(item, 'qtimetadatafield').find((x) => first(x, 'fieldlabel')?.textContent.trim() === label);
  return f ? first(f, 'fieldentry')?.textContent.trim() ?? '' : null;
}

// HTML of a <material>: mattext of type text/html is HTML, anything else is plain text.
function materialHtml(material) {
  if (!material) return '';
  return all(material, 'mattext').map((m) => {
    const t = m.textContent;
    return /html/i.test(m.getAttribute('texttype') || '') ? t : t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  }).join(' ');
}

// Response idents that score points: varequal under a respcondition that sets
// a positive score, ignoring ones inside <not>.
function correctResponses(item) {
  const ids = [];
  for (const cond of all(item, 'respcondition')) {
    const setvar = first(cond, 'setvar');
    if (!setvar || !(Number(setvar.textContent) > 0)) continue;
    for (const v of all(cond, 'varequal')) {
      if (v.closest('not')) continue;
      ids.push(v.textContent.trim());
    }
  }
  return ids;
}

function numericRange(item) {
  for (const cond of all(item, 'respcondition')) {
    const setvar = first(cond, 'setvar');
    if (!setvar || !(Number(setvar.textContent) > 0)) continue;
    const eq = first(cond, 'varequal');
    const lo = first(cond, 'vargte');
    const hi = first(cond, 'varlte');
    if (lo && hi) {
      const a = Number(lo.textContent);
      const b = Number(hi.textContent);
      return { value: String(Number(((a + b) / 2).toPrecision(12))), tolerance: String(Number(((b - a) / 2).toPrecision(12))) };
    }
    if (eq) return { value: eq.textContent.trim(), tolerance: '' };
  }
  return null;
}

function kindOf(item) {
  const t = (metaField(item, 'question_type') || metaField(item, 'cc_profile') || '').toLowerCase();
  if (/true_false/.test(t)) return 'tf';
  if (/multiple_response|multiple_answers/.test(t)) return 'mr';
  if (/multiple_choice|multiple_dropdowns/.test(t)) return t.includes('dropdowns') ? 'unsupported' : 'mc';
  if (/numerical/.test(t)) return 'numerical';
  if (/fib|fill_in|short_answer|pattern_match/.test(t)) return 'fib';
  if (/essay|text_only|file_upload/.test(t)) return t.includes('text_only') ? 'text' : 'essay';
  if (/matching/.test(t)) return 'matching';
  if (t) return 'unsupported';
  // No metadata: guess from the response element
  const lid = first(item, 'response_lid');
  if (lid) return lid.getAttribute('rcardinality') === 'Multiple' ? 'mr' : 'mc';
  if (first(item, 'response_str')) return correctResponses(item).length ? 'fib' : 'essay';
  return 'unsupported';
}

const TYPE_NAMES = { matching: 'Matching', unsupported: 'Unsupported type', text: 'Text-only item' };

// Split assessor's own export feedback back into rationale and model answer.
function splitFeedback(html) {
  const marker = /<p>\s*<strong>\s*Model answer:\s*<\/strong>\s*<\/p>/i;
  const m = html.match(marker);
  if (!m) return { rationale: html, model: '' };
  return { rationale: html.slice(0, m.index), model: html.slice(m.index + m[0].length) };
}

function itemToQuestion(item, ctx, settings) {
  const kind = kindOf(item);
  if (['unsupported', 'text'].includes(kind)) return { skip: TYPE_NAMES[kind] };

  const presentation = first(item, 'presentation');
  const stemMaterial = presentation && childrenNamed(presentation, 'material')[0];
  const stemHtml = stemMaterial ? materialHtml(stemMaterial) : materialHtml(first(item, 'material'));
  const opts = { imageFor: ctx.imageFor };
  const feedbackHtml = all(item, 'itemfeedback').map((f) => materialHtml(first(f, 'material'))).filter(Boolean).join(' ');
  const { rationale, model } = splitFeedback(feedbackHtml);
  const pointsMeta = metaField(item, 'points_possible');

  const make = (type) => {
    const q = newQuestion(type, settings);
    q.stem = htmlToText(stemHtml, opts);
    q.rationale = rationale ? htmlToText(rationale, opts) : '';
    if (pointsMeta !== null && pointsMeta !== '' && !Number.isNaN(Number(pointsMeta))) q.points = Number(pointsMeta);
    return q;
  };

  if (kind === 'mc' || kind === 'mr' || kind === 'tf') {
    const labels = all(item, 'response_label');
    const correct = new Set(correctResponses(item));
    const choices = labels.map((l) => ({ id: l.getAttribute('ident'), text: htmlToInline(materialHtml(first(l, 'material')), opts) }));
    const isTF = kind === 'tf' || (choices.length === 2 && /^true$/i.test(choices[0].text) && /^false$/i.test(choices[1].text));
    if (isTF) {
      const q = make('tf');
      const trueChoice = choices.find((c) => /^true$/i.test(c.text)) ?? choices[0];
      q.answer = correct.has(trueChoice?.id);
      return { question: q };
    }
    const q = make(kind === 'mr' ? 'mr' : 'mc');
    q.choices = choices.map((c) => ({ ...newChoice(c.text), correct: correct.has(c.id) }));
    if (q.type === 'mc') {
      // Single answer: keep only the first correct choice
      let seen = false;
      for (const c of q.choices) {
        if (c.correct && !seen) seen = true;
        else c.correct = false;
      }
    }
    while (q.choices.length < 2) q.choices.push(newChoice());
    return { question: q, note: q.choices.length > 8 ? 'more than 8 choices' : null };
  }

  if (kind === 'matching') {
    const lids = all(item, 'response_lid');
    if (!lids.length) return { skip: 'Matching with no items' };
    const q = make('match');
    const firstLabels = all(lids[0], 'response_label');
    q.choices = firstLabels.map((l) => ({ id: newId(), text: htmlToInline(materialHtml(first(l, 'material')), opts), src: l.getAttribute('ident') }));
    const bySrc = new Map(q.choices.map((c) => [c.src, c.id]));
    // Correct choice for each item: a varequal on that response that adds points
    const answerFor = (lidIdent) => {
      for (const cond of all(item, 'respcondition')) {
        const v = all(cond, 'varequal').find((e) => e.getAttribute('respident') === lidIdent && !e.closest('not'));
        const setvar = first(cond, 'setvar');
        if (v && setvar && Number(setvar.textContent) > 0) return v.textContent.trim();
      }
      return null;
    };
    q.pairs = lids.map((lid) => {
      const promptMaterial = childrenNamed(lid, 'material')[0] ?? first(lid, 'material');
      return { id: newId(), prompt: htmlToInline(materialHtml(promptMaterial), opts), choiceId: bySrc.get(answerFor(lid.getAttribute('ident'))) ?? null };
    });
    q.choices.forEach((c) => delete c.src);
    return { question: q };
  }

  if (kind === 'numerical') {
    const q = make('num');
    const r = numericRange(item);
    if (r) {
      q.answer.value = r.value;
      q.answer.tolerance = r.tolerance;
    }
    return { question: q };
  }

  if (kind === 'fib') {
    const answers = correctResponses(item);
    const firstAnswer = answers[0] ?? '';
    const m = firstAnswer.match(/^\s*(-?[\d.,]+(?:e[-+]?\d+)?)\s*(.*)$/i);
    if (m && !Number.isNaN(parseNumber(m[1]))) {
      const q = make('num');
      q.answer.value = m[1];
      // The unit may only appear in another accepted form ("25", "25 J", …).
      const withUnit = answers.map((a) => a.trim().match(new RegExp(`^${m[1].replace(/[.]/g, '\\.')}\\s+(\\S.*)$`))).find(Boolean);
      q.answer.unit = m[2].trim() || withUnit?.[1] || '';
      const auto = new Set([m[1], `${m[1]}.0`, `${m[1]} ${q.answer.unit}`, `${m[1]}${q.answer.unit}`]);
      q.answer.accepted = answers.slice(1).filter((a) => !auto.has(a.trim()));
      return { question: q };
    }
    // Text answers: assessor has no fill-in type, so keep them as the model answer.
    const q = make('essay');
    q.kind = 'short';
    q.answer.model = answers.join(' / ');
    return { question: q, note: 'fill-in-the-blank with text answers became Short Answer' };
  }

  // essay
  const q = make('essay');
  q.kind = 'essay';
  if (model) q.answer.model = htmlToText(model, opts);
  return { question: q };
}

// Read a .imscc / .zip file. Returns { banks: [{ title, questions }], images, skipped, notes }.
export async function readCartridge(file, settings) {
  const zip = await readZip(file);
  const images = {};
  const imageIds = new Map(); // zip path -> image id
  const skipped = [];
  const notes = { remoteImages: 0, missingImages: 0, groups: 0, converted: [] };

  // QTI files listed in the manifest, or any XML file holding questions.
  let qtiFiles = [];
  if (zip.has('imsmanifest.xml')) {
    const manifest = parseXml(await zip.text('imsmanifest.xml'));
    for (const res of all(manifest, 'resource')) {
      const type = res.getAttribute('type') || '';
      if (!/imsqti/i.test(type) || /learning-application/i.test(type)) continue;
      for (const f of all(res, 'file')) {
        const href = f.getAttribute('href');
        if (href && /\.xml$/i.test(href)) qtiFiles.push(decodeURIComponent(href));
      }
    }
  }
  if (!qtiFiles.length) qtiFiles = zip.names().filter((n) => /\.xml$/i.test(n) && !/imsmanifest|assessment_meta/i.test(n));

  const banks = [];
  for (const path of [...new Set(qtiFiles)]) {
    const xml = await zip.text(path);
    if (!xml || !/questestinterop/.test(xml)) continue;
    const doc = parseXml(xml);
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

    // Load every image the questions point at before converting (zip reads are async).
    const srcs = new Set([...xml.matchAll(/src=(?:&quot;|")([^"&]+)/g)].map((m) => m[1]));
    for (const raw of srcs) {
      const src = raw.replace(/%24/gi, '$');
      if (/^https?:/i.test(src) || /equation_images/.test(src)) continue;
      const rel = src.replace(/^\$IMS-CC-FILEBASE\$\/?/, '');
      const zipPath = [resolvePath(folder, rel), resolvePath('', rel)].map((p) => {
        try { return decodeURIComponent(p); } catch { return p; }
      }).find((p) => zip.has(p));
      if (!zipPath || imageIds.has(zipPath)) continue;
      const ext = zipPath.split('.').pop().toLowerCase();
      const bytes = await zip.bytes(zipPath);
      const id = newId();
      images[id] = bytesToDataUrl(bytes, MIME[ext] || 'application/octet-stream');
      imageIds.set(zipPath, id);
    }
    const imageFor = (raw) => {
      const src = raw.replace(/%24/gi, '$');
      if (/^https?:/i.test(src)) {
        notes.remoteImages++;
        return src;
      }
      const rel = src.replace(/^\$IMS-CC-FILEBASE\$\/?/, '');
      for (const p of [resolvePath(folder, rel), resolvePath('', rel)]) {
        let key = p;
        try { key = decodeURIComponent(p); } catch { /* keep */ }
        if (imageIds.has(key)) return `img:${imageIds.get(key)}`;
      }
      notes.missingImages++;
      return null;
    };

    const containers = [...all(doc, 'assessment'), ...all(doc, 'objectbank')];
    for (const container of containers) {
      const title = container.getAttribute('title') || first(container, 'title')?.textContent || path.split('/').pop().replace(/\.xml$/i, '');
      const questions = [];
      notes.groups += all(container, 'selection_number').length;
      all(container, 'item').forEach((item, i) => {
        try {
          const r = itemToQuestion(item, { imageFor }, settings);
          if (r.skip) skipped.push({ bank: title, number: i + 1, reason: r.skip });
          else {
            questions.push(r.question);
            if (r.note) notes.converted.push({ bank: title, number: i + 1, note: r.note });
          }
        } catch (err) {
          skipped.push({ bank: title, number: i + 1, reason: `couldn’t be read (${err.message})` });
        }
      });
      banks.push({ title: title.trim() || 'Imported questions', questions });
    }
  }
  if (!banks.length) throw new Error('No QTI questions were found in this file.');
  return { banks, images, skipped, notes };
}
