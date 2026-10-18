"""Build two Schoology import tests: matching and fill-in-the-blank.

text2qti generates the quiz shell (manifest, assessment metadata, item
metadata Schoology needs). For the fill-in test its short-answer items are
used as-is, with MathML swapped in for tokens. text2qti can't write matching
questions, so in the matching test placeholder items are replaced with
hand-built Canvas-style matching_question items.

Usage: python3 -I build_matching_fib_tests.py <output_dir>
Requires: text2qti, pandoc
"""
import hashlib
import os
import re
import subprocess
import sys
import tempfile
import zipfile
from xml.sax.saxutils import escape as xml_escape

# ---------------------------------------------------------------- MathML

def to_mathml(latex, display=False):
    src = ("$$%s$$" if display else "$%s$") % latex
    out = subprocess.run(["pandoc", "-f", "latex", "-t", "html", "--mathml"],
                         input=src, capture_output=True, text=True, check=True).stdout
    m = re.search(r"<math\b.*?</math>", out, re.S)
    if not m:
        sys.exit("pandoc produced no MathML for: %s" % latex)
    mathml = re.sub(r"<annotation\b.*?</annotation>", "", m.group(0), flags=re.S)
    return mathml.replace("<semantics>", "").replace("</semantics>", "")

# ---------------------------------------------------------------- matching

# Each entry: stem HTML, list of (prompt HTML, correct choice index), choices HTML, points
MATCHING = {
    "MATCHONE": {
        "stem": "<p>Test 1 (plain text, 4 prompts, 4 choices). Match each quantity with its SI unit.</p>",
        "pairs": [("Velocity", 0), ("Force", 1), ("Energy", 2), ("Power", 3)],
        "choices": ["m/s", "N", "J", "W"],
        "html": False,
    },
    "MATCHTWO": {
        "stem": "<p>Test 2 (plain text, 3 prompts, 5 choices including 2 distractors). Match each device with the energy change it mainly performs.</p>",
        "pairs": [("Battery", 0), ("Electric motor", 1), ("Solar cell", 2)],
        "choices": ["chemical to electrical", "electrical to kinetic", "light to electrical",
                    "kinetic to thermal", "sound to electrical"],
        "html": False,
    },
    "MATCHTHREE": {
        "stem": "<p>Test 3 (MathML in the choices). Match each quantity with its equation.</p>",
        "pairs": [("Kinetic energy", 0), ("Momentum", 1), ("Weight", 2)],
        "choices": [to_mathml(r"\frac{1}{2}mv^2"), to_mathml(r"\vec{p} = m\vec{v}"),
                    to_mathml(r"W = mg"), to_mathml(r"P = \frac{W}{t}")],
        "html": True,
    },
    "MATCHFOUR": {
        "stem": "<p>Test 4 (MathML in the prompts). Match each equation with the quantity it calculates.</p>",
        "pairs": [(to_mathml(r"v = \frac{d}{t}"), 0), (to_mathml(r"a = \frac{\Delta v}{t}"), 1),
                  (to_mathml(r"\rho = \frac{m}{V}"), 2)],
        "choices": ["speed", "acceleration", "density"],
        "html": True,
    },
}

MATCHING_QUIZ = """\
Quiz title: assessor matching import test
shuffle answers: false

Points: 4
1. MATCHONE
*a) placeholder one
b) placeholder two

Points: 3
2. MATCHTWO
*a) placeholder one
b) placeholder two

Points: 3
3. MATCHTHREE
*a) placeholder one
b) placeholder two

Points: 3
4. MATCHFOUR
*a) placeholder one
b) placeholder two

5. Test 5 (control, multiple choice). This question confirms the import itself worked.
*a) Correct
b) Wrong
"""

def short_id(*parts):
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]

def mattext(content, as_html):
    kind = "text/html" if as_html else "text/plain"
    return '<mattext texttype="%s">%s</mattext>' % (kind, xml_escape(content))

def matching_item(item_ident, ref, points, spec):
    prompt_ids = [short_id(item_ident, "prompt", str(i)) for i in range(len(spec["pairs"]))]
    choice_ids = [short_id(item_ident, "choice", str(i)) for i in range(len(spec["choices"]))]
    choices_xml = "".join(
        '<response_label ident="%s"><material>%s</material></response_label>'
        % (cid, mattext(text, spec["html"]))
        for cid, text in zip(choice_ids, spec["choices"]))
    lids = "".join(
        '<response_lid ident="response_%s"><material>%s</material>'
        '<render_choice>%s</render_choice></response_lid>'
        % (pid, mattext(prompt, spec["html"]), choices_xml)
        for pid, (prompt, _) in zip(prompt_ids, spec["pairs"]))
    share = "%.2f" % (100.0 / len(spec["pairs"]))
    conditions = "".join(
        '<respcondition><conditionvar><varequal respident="response_%s">%s</varequal>'
        '</conditionvar><setvar varname="SCORE" action="Add">%s</setvar></respcondition>'
        % (pid, choice_ids[correct], share)
        for pid, (_, correct) in zip(prompt_ids, spec["pairs"]))
    meta = "".join(
        "<qtimetadatafield><fieldlabel>%s</fieldlabel><fieldentry>%s</fieldentry></qtimetadatafield>"
        % kv for kv in [("question_type", "matching_question"),
                        ("points_possible", points),
                        ("original_answer_ids", ",".join(prompt_ids)),
                        ("assessment_question_identifierref", ref)])
    return ('<item ident="%s" title="Question"><itemmetadata><qtimetadata>%s</qtimetadata></itemmetadata>'
            '<presentation><material>%s</material>%s</presentation>'
            '<resprocessing><outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/>'
            '</outcomes>%s</resprocessing></item>'
            % (item_ident, meta, mattext(spec["stem"], True), lids, conditions))

def replace_matching_items(xml):
    def swap(m):
        item = m.group(0)
        for token, spec in MATCHING.items():
            if token in item:
                ident = re.search(r'<item ident="([^"]+)"', item).group(1)
                ref = re.search(r"assessment_question_identifierref</fieldlabel>\s*<fieldentry>([^<]+)", item).group(1)
                points = re.search(r"points_possible</fieldlabel>\s*<fieldentry>([^<]+)", item).group(1)
                return matching_item(ident, ref, points, spec)
        return item
    out = re.sub(r"<item\b.*?</item>", swap, xml, flags=re.S)
    for token in MATCHING:
        if token in out:
            sys.exit("matching token not replaced: " + token)
    return out

# ---------------------------------------------------------------- fill in the blank

FIB_TOKENS = {
    "FTKA": to_mathml(r"K = \frac{1}{2}mv^2"),
    "FTKB": to_mathml(r"W = mg"),
    "FTKC": to_mathml(r"v = v_0 + at"),
}

FIB_QUIZ = """\
Quiz title: assessor fill-in-the-blank import test
shuffle answers: false

1. Test 1 (number with accepted forms). A 2.0 kg cart moves at 5.0 m/s. Using FTKA, what is its kinetic energy in joules?
* 25
* 25.0
* 25 J
* 25.0 J

2. Test 2 (case sensitivity). The SI unit of force is the ____. (Only "newton" and "N" are listed; try answering "Newton".)
* newton
* N

3. Test 3 (MathML in the stem, decimals). Using FTKB, a 1.0 kg mass weighs 9.8 N. What is g in N/kg?
* 9.8
* 9.80
* 9.81

4. Test 4 (negative decimal). A ball starts at rest and accelerates at -9.8 m/s per second for 0.5 s. Using FTKC, what is v in m/s?
* -4.9

5. Test 5 (control, multiple choice). This question confirms the import itself worked.
*a) Correct
b) Wrong
"""

# ---------------------------------------------------------------- build

def build(quiz_text, name, out_dir, transform):
    out_zip = os.path.join(out_dir, name + ".zip")
    with tempfile.TemporaryDirectory() as work:
        src = os.path.join(work, name + ".txt")
        with open(src, "w") as f:
            f.write(quiz_text)
        subprocess.run(["text2qti", src], check=True, cwd=work)
        with zipfile.ZipFile(os.path.join(work, name + ".zip")) as zin, \
             zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename.endswith(".xml"):
                    data = transform(data.decode("utf-8")).encode("utf-8")
                zout.writestr(info, data)
    print("wrote", out_zip)

def fib_transform(xml):
    for token, fragment in FIB_TOKENS.items():
        xml = xml.replace(token, xml_escape(fragment))
    return xml

def main(out_dir):
    build(MATCHING_QUIZ, "matching_test", out_dir, replace_matching_items)
    build(FIB_QUIZ, "fill_in_blank_test", out_dir, fib_transform)

if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
