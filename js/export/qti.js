// Schoology export: a Common Cartridge zip with QTI 1.2 items, structured like
// text2qti's output (which Schoology is known to import), including the
// itemmetadata block Schoology needs. Math is exported as MathML.
//
// Verified in Schoology (schoology-tests/): MathML, multiple choice/answers,
// fill-in-the-blank (short_answer_question) and hand-built matching items.

import { renderInline, renderRich } from '../richtext.js';
import { instantiate, isDynamic } from '../algo/engine.js';
import { displayOrder } from '../testmodel.js';
import { testSeed } from '../containers.js';
import { makeZip, dataUrlToBytes } from './zip.js';

const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function randomHex(n = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n / 2)), (b) => b.toString(16).padStart(2, '0')).join('');
}

const mattext = (html) => `<mattext texttype="text/html">${x(html)}</mattext>`;

function metadata(type, points, answerIds, ref) {
  const field = (k, v) => `<qtimetadatafield><fieldlabel>${k}</fieldlabel><fieldentry>${v}</fieldentry></qtimetadatafield>`;
  return `<itemmetadata><qtimetadata>${field('question_type', type)}${field('points_possible', points)}${field('original_answer_ids', answerIds.join(','))}${field('assessment_question_identifierref', ref)}</qtimetadata></itemmetadata>`;
}

const outcomes = '<outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>';
const feedbackCondition = '<respcondition continue="Yes"><conditionvar><other/></conditionvar><displayfeedback feedbacktype="Response" linkrefid="general_fb"/></respcondition>';
const feedbackBlock = (html) => `<itemfeedback ident="general_fb"><flow_mat><material>${mattext(html)}</material></flow_mat></itemfeedback>`;

// Accepted answers for a numeric question exported as fill-in-the-blank.
export function numericAnswers(q, inst) {
  const clean = (s) => String(s ?? '').replace(/−/g, '-').trim();
  const base = clean(inst.plain(q.answer.value));
  const forms = [];
  if (base) {
    forms.push(base);
    if (/^-?\d+$/.test(base)) forms.push(`${base}.0`);
    const unit = clean(q.answer.unit);
    if (unit) forms.push(`${base} ${unit}`, `${base}${unit}`);
  }
  for (const a of q.answer.accepted || []) forms.push(clean(inst.plain(a)));
  return [...new Set(forms.filter(Boolean))];
}

// One QTI <item>. ctx: { images: id -> url, feedback: bool }
export function qtiItem(q, { seed, version = 'A', ctx }) {
  const inst = instantiate(q, { seed, version });
  const resolve = inst.dynamic ? inst.resolve : null;
  const opts = { mathml: true };
  const rich = (s) => renderRich(s, ctx.images, resolve, opts);
  const choiceHtml = (s) => `<p>${renderInline(s, ctx.images, resolve, opts)}</p>`;
  const ident = `assessor_question_${randomHex()}`;
  const ref = `assessor_question_ref_${randomHex()}`;
  const points = Number(q.points) || 0;
  const stem = rich(q.stem) || '<p></p>';

  let feedbackHtml = ctx.feedback && q.rationale?.trim() ? rich(q.rationale) : '';
  if (q.type === 'essay' && ctx.feedback && q.answer.model?.trim()) {
    feedbackHtml += `<p><strong>Model answer:</strong></p>${rich(q.answer.model)}`;
  }
  const fbCond = feedbackHtml ? feedbackCondition : '';
  const fbBlock = feedbackHtml ? feedbackBlock(feedbackHtml) : '';

  if (q.type === 'mc' || q.type === 'mr' || q.type === 'tf') {
    const choices = q.type === 'tf'
      ? [{ text: 'True', correct: q.answer === true }, { text: 'False', correct: q.answer === false }]
      : q.choices;
    const ids = choices.map(() => `assessor_choice_${randomHex()}`);
    const labels = choices
      .map((c, i) => `<response_label ident="${ids[i]}"><material>${mattext(q.type === 'tf' ? `<p>${c.text}</p>` : choiceHtml(c.text))}</material></response_label>`)
      .join('');
    const multi = q.type === 'mr';
    let scoring;
    if (multi) {
      const conds = choices.map((c, i) => (c.correct
        ? `<varequal respident="response1">${ids[i]}</varequal>`
        : `<not><varequal respident="response1">${ids[i]}</varequal></not>`)).join('');
      scoring = `<respcondition continue="No"><conditionvar><and>${conds}</and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`;
    } else {
      const correct = ids[choices.findIndex((c) => c.correct)] ?? ids[0];
      scoring = `<respcondition continue="No"><conditionvar><varequal respident="response1">${correct}</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>`;
    }
    const type = { mc: 'multiple_choice_question', mr: 'multiple_answers_question', tf: 'true_false_question' }[q.type];
    return `<item ident="${ident}" title="Question">${metadata(type, points, ids, ref)}<presentation><material>${mattext(stem)}</material><response_lid ident="response1" rcardinality="${multi ? 'Multiple' : 'Single'}"><render_choice>${labels}</render_choice></response_lid></presentation><resprocessing>${outcomes}${fbCond}${scoring}</resprocessing>${fbBlock}</item>`;
  }

  if (q.type === 'num') {
    const answers = numericAnswers(q, inst);
    const ids = answers.map(() => `assessor_choice_${randomHex()}`);
    const conds = answers.map((a) => `<varequal respident="response1">${x(a)}</varequal>`).join('');
    return `<item ident="${ident}" title="Question">${metadata('short_answer_question', points, ids, ref)}<presentation><material>${mattext(stem)}</material><response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation><resprocessing>${outcomes}${fbCond}<respcondition continue="No"><conditionvar>${conds}</conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>${fbBlock}</item>`;
  }

  // Short answer / problem / essay: graded by hand
  return `<item ident="${ident}" title="Question">${metadata('essay_question', points, [], ref)}<presentation><material>${mattext(stem)}</material><response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation><resprocessing>${outcomes}<respcondition continue="No"><conditionvar><other/></conditionvar></respcondition>${fbCond}</resprocessing>${fbBlock}</item>`;
}

// A random-pick group: Schoology-side, each student sees one of the variants.
function groupSection(itemsXml, points) {
  return `<section ident="assessor_group_${randomHex()}" title="Group"><selection_ordering><selection><selection_number>1</selection_number><selection_extension><points_per_item>${points}</points_per_item></selection_extension></selection></selection_ordering>${itemsXml.join('')}</section>`;
}

// entries: [{ question, seed, version }] or { group: [{ question, seed, version }], points }
export function buildPackage(lib, title, entries, { feedback = true } = {}) {
  const assessmentId = `assessor_assessment_${randomHex(32)}`;
  const images = new Map(); // image id -> file name
  const ctx = {
    feedback,
    images: (id) => {
      const data = lib.images[id];
      if (!data) return '';
      if (!images.has(id)) {
        const ext = (data.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg');
        images.set(id, `img_${id}.${ext}`);
      }
      return `%24IMS-CC-FILEBASE%24/images/${images.get(id)}`;
    },
  };

  let total = 0;
  const body = entries.map((e) => {
    if (e.group) {
      total += e.points;
      return groupSection(e.group.map((g) => qtiItem(g.question, { seed: g.seed, version: g.version, ctx })), e.points);
    }
    total += Number(e.question.points) || 0;
    return qtiItem(e.question, { seed: e.seed, version: e.version, ctx });
  }).join('');

  const assessment = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/ims_qtiasiv1p2 http://www.imsglobal.org/xsd/ims_qtiasiv1p2p1.xsd">
<assessment ident="${assessmentId}" title="${x(title)}"><qtimetadata><qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>1</fieldentry></qtimetadatafield></qtimetadata><section ident="root_section">${body}</section></assessment>
</questestinterop>
`;

  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="${assessmentId}" xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <title>${x(title)}</title>
  <description></description>
  <shuffle_answers>false</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <hide_results></hide_results>
  <quiz_type>assignment</quiz_type>
  <points_possible>${total.toFixed(1)}</points_possible>
  <require_lockdown_browser>false</require_lockdown_browser>
  <require_lockdown_browser_for_results>false</require_lockdown_browser_for_results>
  <require_lockdown_browser_monitor>false</require_lockdown_browser_monitor>
  <lockdown_browser_monitor_data/>
  <show_correct_answers>true</show_correct_answers>
  <anonymous_submissions>false</anonymous_submissions>
  <could_be_locked>false</could_be_locked>
  <allowed_attempts>1</allowed_attempts>
  <one_question_at_a_time>false</one_question_at_a_time>
  <cant_go_back>false</cant_go_back>
  <available>false</available>
  <one_time_results>false</one_time_results>
  <show_correct_answers_last_attempt>false</show_correct_answers_last_attempt>
  <only_visible_to_overrides>false</only_visible_to_overrides>
  <module_locked>false</module_locked>
  <assignment identifier="assessor_assignment_${assessmentId.slice(-32)}">
    <title>${x(title)}</title>
    <due_at/>
    <lock_at/>
    <unlock_at/>
    <module_locked>false</module_locked>
    <workflow_state>unpublished</workflow_state>
    <assignment_overrides>
    </assignment_overrides>
    <quiz_identifierref>${assessmentId}</quiz_identifierref>
    <allowed_extensions></allowed_extensions>
    <has_group_category>false</has_group_category>
    <points_possible>${total.toFixed(1)}</points_possible>
    <grading_type>points</grading_type>
    <all_day>false</all_day>
    <submission_types>online_quiz</submission_types>
    <position>1</position>
    <turnitin_enabled>false</turnitin_enabled>
    <vericite_enabled>false</vericite_enabled>
    <peer_review_count>0</peer_review_count>
    <peer_reviews>false</peer_reviews>
    <automatic_peer_reviews>false</automatic_peer_reviews>
    <anonymous_peer_reviews>false</anonymous_peer_reviews>
    <grade_group_students_individually>false</grade_group_students_individually>
    <freeze_on_copy>false</freeze_on_copy>
    <omit_from_final_grade>false</omit_from_final_grade>
    <intra_group_peer_reviews>false</intra_group_peer_reviews>
    <only_visible_to_overrides>false</only_visible_to_overrides>
    <post_to_sis>false</post_to_sis>
    <moderated_grading>false</moderated_grading>
    <grader_count>0</grader_count>
    <grader_comments_visible_to_graders>true</grader_comments_visible_to_graders>
    <anonymous_grading>false</anonymous_grading>
    <graders_anonymous_to_graders>false</graders_anonymous_to_graders>
    <grader_names_visible_to_final_grader>true</grader_names_visible_to_final_grader>
    <anonymous_instructor_annotations>false</anonymous_instructor_annotations>
    <post_policy>
      <post_manually>false</post_manually>
    </post_policy>
  </assignment>
  <assignment_group_identifierref>assessor_assignment-group_${assessmentId.slice(-32)}</assignment_group_identifierref>
  <assignment_overrides>
  </assignment_overrides>
</quiz>
`;

  const imageResources = [...images.values()]
    .map((name) => `    <resource identifier="assessor_image_${randomHex()}" type="webcontent" href="images/${name}">\n      <file href="images/${name}"/>\n    </resource>`)
    .join('\n');
  const dependencyId = `assessor_dependency_${assessmentId.slice(-32)}`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="assessor_manifest_${assessmentId.slice(-32)}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:imsmd="http://www.imsglobal.org/xsd/imsmd_v1p2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/xsd/imscp_v1p1.xsd http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource http://www.imsglobal.org/profile/cc/ccv1p1/LOM/ccv1p1_lomresource_v1p0.xsd http://www.imsglobal.org/xsd/imsmd_v1p2 http://www.imsglobal.org/xsd/imsmd_v1p2p2.xsd">
  <metadata>
    <schema>IMS Content</schema>
    <schemaversion>1.1.3</schemaversion>
    <imsmd:lom>
      <imsmd:general>
        <imsmd:title>
          <imsmd:string>${x(title)}</imsmd:string>
        </imsmd:title>
      </imsmd:general>
      <imsmd:lifeCycle>
        <imsmd:contribute>
          <imsmd:date>
            <imsmd:dateTime>${new Date().toISOString().slice(0, 10)}</imsmd:dateTime>
          </imsmd:date>
        </imsmd:contribute>
      </imsmd:lifeCycle>
    </imsmd:lom>
  </metadata>
  <organizations/>
  <resources>
    <resource identifier="${assessmentId}" type="imsqti_xmlv1p2">
      <file href="${assessmentId}/${assessmentId}.xml"/>
      <dependency identifierref="${dependencyId}"/>
    </resource>
    <resource identifier="${dependencyId}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${assessmentId}/assessment_meta.xml">
      <file href="${assessmentId}/assessment_meta.xml"/>
    </resource>
${imageResources}
  </resources>
</manifest>
`;

  const files = [
    { name: 'imsmanifest.xml', data: manifest },
    { name: 'non_cc_assessments/', data: '' },
    { name: `${assessmentId}/assessment_meta.xml`, data: meta },
    { name: `${assessmentId}/${assessmentId}.xml`, data: assessment },
    ...[...images].map(([id, name]) => ({ name: `images/${name}`, data: dataUrlToBytes(lib.images[id]).bytes })),
  ];
  return { files, assessment, manifest, meta, points: total };
}

// ---- tests and banks ---------------------------------------------------------------

// options: { mode: 'fixed' | 'pool', version: 'A', poolSize: 5, feedback: true }
export function testEntries(test, { mode = 'fixed', version = 'A', poolSize = 5 } = {}) {
  return displayOrder(test).map((item) => {
    const q = item.question;
    if (mode === 'pool' && isDynamic(q)) {
      const group = Array.from({ length: poolSize }, (_, k) => ({ question: q, seed: testSeed(test, q, `pool${k + 1}`), version }));
      return { group, points: Number(q.points) || 0 };
    }
    return { question: q, seed: testSeed(test, q, version), version };
  });
}

export function bankEntries(bank, { mode = 'fixed', poolSize = 5 } = {}) {
  return bank.questions.filter((q) => !q.flags.doNotUse).map((q) => {
    if (mode === 'pool' && isDynamic(q)) {
      return { group: Array.from({ length: poolSize }, (_, k) => ({ question: q, seed: `${q.id}|pool${k + 1}`, version: 'A' })), points: Number(q.points) || 0 };
    }
    return { question: q, seed: q.id, version: 'A' };
  });
}

export function exportZip(lib, title, entries, options) {
  const pkg = buildPackage(lib, title, entries, options);
  return { blob: makeZip(pkg.files), ...pkg };
}

export function zipFileName(title) {
  return `${(title || 'quiz').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'quiz'}.zip`;
}

