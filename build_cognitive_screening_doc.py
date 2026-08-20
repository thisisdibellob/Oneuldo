from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


OUT = "인지능력_연구용_선별지_25문항.docx"
FONT = "Arial Unicode MS"
NAVY = "173B57"
BLUE = "2E74B5"
TEAL = "2B7A78"
LIGHT_BLUE = "E8F1F7"
LIGHT_TEAL = "E8F4F2"
LIGHT_GRAY = "F2F4F7"
MID_GRAY = "D9E0E6"
TEXT = "1F2933"
MUTED = "5F6B76"
WHITE = "FFFFFF"


def rgb(hex_color):
    return RGBColor.from_string(hex_color)


def set_run(run, size=11, bold=False, color=TEXT, italic=False):
    run.font.name = FONT
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), FONT)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), FONT)
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), FONT)
    run._element.get_or_add_rPr().rFonts.set(qn("w:cs"), FONT)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = rgb(color)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_table_geometry(table, widths_dxa, indent_dxa=120):
    total = sum(widths_dxa)
    table.autofit = False
    tbl_pr = table._tbl.tblPr
    tbl_w = tbl_pr.first_child_found_in("w:tblW")
    if tbl_w is None:
        tbl_w = OxmlElement("w:tblW")
        tbl_pr.append(tbl_w)
    tbl_w.set(qn("w:w"), str(total))
    tbl_w.set(qn("w:type"), "dxa")
    tbl_ind = tbl_pr.first_child_found_in("w:tblInd")
    if tbl_ind is None:
        tbl_ind = OxmlElement("w:tblInd")
        tbl_pr.append(tbl_ind)
    tbl_ind.set(qn("w:w"), str(indent_dxa))
    tbl_ind.set(qn("w:type"), "dxa")
    grid = table._tbl.tblGrid
    for child in list(grid):
        grid.remove(child)
    for width in widths_dxa:
        gc = OxmlElement("w:gridCol")
        gc.set(qn("w:w"), str(width))
        grid.append(gc)
    for row in table.rows:
        for i, cell in enumerate(row.cells):
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.first_child_found_in("w:tcW")
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(widths_dxa[i]))
            tc_w.set(qn("w:type"), "dxa")
            cell.width = Inches(widths_dxa[i] / 1440)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            set_cell_margins(cell)


def set_table_borders(table, color=MID_GRAY, size="6"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:space"), "0")
        tag.set(qn("w:color"), color)


def format_cell_text(cell, size=10, bold=False, color=TEXT, align=None):
    for p in cell.paragraphs:
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.15
        if align is not None:
            p.alignment = align
        for r in p.runs:
            set_run(r, size=size, bold=bold, color=color)


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.add_run(text)
    return p


def add_note_box(doc, label, text, fill=LIGHT_BLUE, accent=BLUE):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    set_table_geometry(table, [9360])
    set_table_borders(table, color=accent, size="8")
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(f"{label}  ")
    set_run(r, 10.5, True, accent)
    r = p.add_run(text)
    set_run(r, 10.5, False, TEXT)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_metadata_table(doc):
    table = doc.add_table(rows=2, cols=4)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    set_table_geometry(table, [1500, 3180, 1500, 3180])
    set_table_borders(table)
    labels = [("참여자 코드", ""), ("검사일", ""), ("연령", ""), ("검사자", "")]
    for idx, (label, value) in enumerate(labels):
        row = idx // 2
        col = (idx % 2) * 2
        table.cell(row, col).text = label
        table.cell(row, col + 1).text = " " * 4 + "________________________________"
        set_cell_shading(table.cell(row, col), LIGHT_GRAY)
        format_cell_text(table.cell(row, col), 9.5, True, NAVY, WD_ALIGN_PARAGRAPH.CENTER)
        format_cell_text(table.cell(row, col + 1), 9.5, False, TEXT)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_question_table(doc, questions, start_no, response_label="응답"):
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    widths = [650, 7650, 1060]
    set_table_geometry(table, widths)
    set_table_borders(table)
    headers = ["번호", "문항", response_label]
    for i, h in enumerate(headers):
        table.cell(0, i).text = h
        set_cell_shading(table.cell(0, i), NAVY)
        format_cell_text(table.cell(0, i), 9.5, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
    set_repeat_table_header(table.rows[0])
    for offset, question in enumerate(questions):
        cells = table.add_row().cells
        cells[0].text = str(start_no + offset)
        cells[1].text = question
        cells[2].text = "________"
        if offset % 2:
            set_cell_shading(cells[1], "F8FAFB")
            set_cell_shading(cells[2], "F8FAFB")
        format_cell_text(cells[0], 10, True, NAVY, WD_ALIGN_PARAGRAPH.CENTER)
        format_cell_text(cells[1], 10, False, TEXT)
        format_cell_text(cells[2], 10, False, TEXT, WD_ALIGN_PARAGRAPH.CENTER)
    return table


def page_break(doc):
    doc.add_page_break()


doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(0.78)
section.bottom_margin = Inches(0.78)
section.left_margin = Inches(1.0)
section.right_margin = Inches(1.0)
section.header_distance = Inches(0.492)
section.footer_distance = Inches(0.492)

# Compact reference guide token map.
styles = doc.styles
normal = styles["Normal"]
normal.font.name = FONT
normal._element.rPr.rFonts.set(qn("w:ascii"), FONT)
normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
normal._element.rPr.rFonts.set(qn("w:cs"), FONT)
normal.font.size = Pt(11)
normal.font.color.rgb = rgb(TEXT)
normal.paragraph_format.space_before = Pt(0)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.25

for style_name, size, color, before, after in (
    ("Heading 1", 16, BLUE, 18, 10),
    ("Heading 2", 13, BLUE, 14, 7),
    ("Heading 3", 12, NAVY, 10, 5),
):
    s = styles[style_name]
    s.font.name = FONT
    s._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    s._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    s._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    s._element.rPr.rFonts.set(qn("w:cs"), FONT)
    s.font.size = Pt(size)
    s.font.bold = True
    s.font.color.rgb = rgb(color)
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.keep_with_next = True

# Quiet running header and page-number footer.
header = section.header
hp = header.paragraphs[0]
hp.alignment = WD_ALIGN_PARAGRAPH.LEFT
hr = hp.add_run("연구용 인지능력 선별지 · 25문항")
set_run(hr, 8.5, True, MUTED)
footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fr = fp.add_run("연구용 · 진단 및 IQ 환산 금지   |   ")
set_run(fr, 8, False, MUTED)
fld = OxmlElement("w:fldSimple")
fld.set(qn("w:instr"), "PAGE")
fp._p.append(fld)

# First-page workshop-style title block.
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(10)
p.paragraph_format.space_after = Pt(2)
r = p.add_run("RESEARCH SCREENING FORM")
set_run(r, 9, True, TEAL)
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(4)
r = p.add_run("연구용 인지능력 선별지")
set_run(r, 28, True, NAVY)
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(16)
r = p.add_run("언어이해 · 수리추론 · 도형/규칙추론 · 작업기억 · 일상 문제해결")
set_run(r, 12.5, False, MUTED)

metric = doc.add_table(rows=1, cols=4)
metric.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(metric, [2340, 2340, 2340, 2340])
set_table_borders(metric, color="B9D7D5", size="6")
for i, (big, small) in enumerate((("25", "총 문항"), ("5", "평가 영역"), ("약 20분", "예상 시간"), ("연구용", "사용 범위"))):
    set_cell_shading(metric.cell(0, i), LIGHT_TEAL)
    p = metric.cell(0, i).paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(1)
    rb = p.add_run(big + "\n")
    set_run(rb, 13, True, TEAL)
    rs = p.add_run(small)
    set_run(rs, 8.5, False, MUTED)

doc.add_paragraph()
add_note_box(
    doc,
    "중요",
    "이 도구는 표준화된 지능검사가 아닙니다. IQ 산출, 지적장애 진단·등급 판정, 복지·고용·교육 자격 결정에 사용하지 마십시오.",
    fill="FFF5E6",
    accent="A86500",
)

add_heading(doc, "1. 사용 목적", 1)
p = doc.add_paragraph()
p.add_run("프로그램 참여자의 현재 과제 수행 특성을 다섯 영역에서 간단히 관찰하고, 설명 방식·과제 난이도·지원 수준을 조정하기 위한 연구용 선별지입니다. 결과는 이 검사에서의 수행만을 기술합니다.")

add_heading(doc, "2. 실시 원칙", 1)
principles = [
    ("환경", "조용하고 익숙한 장소에서 1:1 실시를 권장합니다."),
    ("지시", "문항은 한 번 읽어 주되, 이해하지 못하면 같은 문장을 한 번 더 읽을 수 있습니다."),
    ("도움", "정답을 암시하지 마십시오. 반복·휴식·보조기기 사용은 실시기록에 남깁니다."),
    ("접근성", "말 대신 가리키기·쓰기 등 응답방식은 허용할 수 있습니다. 감각·운동 제한 때문에 수행하지 못한 항목은 오답이 아니라 ‘실시불가’로 별도 기록합니다."),
    ("중단", "불안·피로·거부가 나타나면 즉시 휴식하거나 중단합니다."),
]
for label, desc in principles:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.1)
    r = p.add_run(label + "  ")
    set_run(r, 10.5, True, NAVY)
    r = p.add_run(desc)
    set_run(r, 10.5)

add_heading(doc, "3. 기록", 1)
add_metadata_table(doc)
p = doc.add_paragraph()
r = p.add_run("실시조건/특이사항: ")
set_run(r, 10, True, NAVY)
r = p.add_run("________________________________________________________________________________")
set_run(r, 10, False, MUTED)

# Participant form.
page_break(doc)
add_heading(doc, "피검사용 문항지", 1)
add_metadata_table(doc)
add_note_box(doc, "안내", "천천히 풀어도 됩니다. 모르면 ‘모르겠습니다’라고 답해도 됩니다. 쉬고 싶으면 언제든 검사자에게 말하세요.")

add_heading(doc, "A. 언어이해", 2)
language = [
    "비가 올 때 몸이 젖지 않도록 사용하는 것은 무엇입니까?  ① 우산  ② 베개  ③ 접시  ④ 연필",
    "‘약속을 지킨다’와 가장 가까운 뜻은 무엇입니까?  ① 정한 일을 한다  ② 큰 소리로 말한다  ③ 물건을 숨긴다  ④ 빨리 걷는다",
    "버스와 지하철의 공통점으로 가장 알맞은 것은 무엇입니까?  ① 음식을 만든다  ② 사람을 이동시킨다  ③ 잠을 잔다  ④ 글을 쓴다",
    "민수는 문을 두드렸지만 안에서 대답이 없었습니다. 가장 알맞은 생각은?  ① 아무도 없을 수 있다  ② 문이 말을 한다  ③ 비가 반드시 온다  ④ 시간이 멈췄다",
    "모든 파란 상자에는 공이 들어 있습니다. 이 상자는 파란색입니다. 알 수 있는 것은?  ① 공이 들어 있다  ② 상자가 비어 있다  ③ 상자가 빨갛다  ④ 알 수 없다",
]
add_question_table(doc, language, 1)

add_heading(doc, "B. 수리추론", 2)
math_q = [
    "사과 2개와 사과 3개를 합치면 모두 몇 개입니까?  ① 4  ② 5  ③ 6  ④ 7",
    "사탕 10개 중 4개를 먹었습니다. 몇 개가 남습니까?  ① 4  ② 5  ③ 6  ④ 7",
    "다음 수의 빈칸에 들어갈 수는?  3, 6, 9, ___  ① 10  ② 11  ③ 12  ④ 15",
    "연필 한 자루가 500원입니다. 두 자루는 얼마입니까?  ① 500원  ② 700원  ③ 1,000원  ④ 1,500원",
    "과자 18개를 네 사람에게 똑같이 나누면 한 사람당 몇 개이고 몇 개가 남습니까?  ① 3개, 6개 남음  ② 4개, 2개 남음  ③ 5개, 2개 남음  ④ 6개, 남지 않음",
]
add_question_table(doc, math_q, 6)

page_break(doc)
add_heading(doc, "C. 도형·규칙추론", 2)
pattern_q = [
    "다음에 올 모양은?  ○ △ ○ △ ___  ① ○  ② △  ③ □  ④ ☆",
    "다음에 올 모양은?  □ □ ●  □ □ ●  ___  ① □  ② ●  ③ △  ④ ○",
    "묶음의 규칙을 보고 다음 묶음을 고르세요.  ▲ | ▲▲ | ▲▲▲ | ___  ① ▲▲  ② ▲▲▲  ③ ▲▲▲▲  ④ ■■■■",
    "다음 표에서 빈칸에 들어갈 모양은?  첫째 줄: ○ △ ○ / 둘째 줄: △ ○ △ / 셋째 줄: ○ △ ___  ① ○  ② △  ③ □  ④ ☆",
    "화살표가 시계 방향으로 한 칸씩 돕니다.  ↑ → ↓ ___  ① ↑  ② →  ③ ↓  ④ ←",
]
add_question_table(doc, pattern_q, 11)

add_heading(doc, "D. 작업기억", 2)
add_note_box(doc, "검사자 실시", "이 영역의 내용은 검사자가 별도 지시문에서 읽어 줍니다. 피검자는 내용을 미리 보지 않습니다.", fill=LIGHT_GRAY, accent=MUTED)
memory_prompts = [
    "검사자가 읽어 주는 숫자를 같은 순서로 말하세요.",
    "검사자가 읽어 주는 숫자를 같은 순서로 말하세요.",
    "검사자가 읽어 주는 숫자를 같은 순서로 말하세요.",
    "검사자가 읽어 주는 숫자를 거꾸로 말하세요.",
    "검사자가 말하는 세 가지 행동을 순서대로 하세요.",
]
add_question_table(doc, memory_prompts, 16, "검사자 기록")

add_heading(doc, "E. 일상 문제해결", 2)
daily = [
    "약 봉투에 ‘식사 후 복용’이라고 적혀 있습니다. 언제 먹는 것이 알맞습니까?  ① 식사 후  ② 잠자는 중  ③ 식사 전날  ④ 아무 때나",
    "횡단보도 신호가 빨간불입니다. 가장 안전한 행동은?  ① 바로 건넌다  ② 초록불을 기다린다  ③ 도로에 앉는다  ④ 눈을 감고 걷는다",
    "5,000원을 내고 3,200원짜리 물건을 샀습니다. 거스름돈은?  ① 800원  ② 1,200원  ③ 1,800원  ④ 2,800원",
    "약속은 오후 2시입니다. 가는 데 30분, 10분 일찍 도착하려면 몇 시에 출발해야 합니까?  ① 1시 10분  ② 1시 20분  ③ 1시 30분  ④ 1시 50분",
    "낯선 곳에서 길을 잃었습니다. 가장 안전한 행동은?  ① 낯선 사람을 무조건 따라간다  ② 혼자 계속 멀리 간다  ③ 직원·경찰에게 도움을 요청하거나 믿을 수 있는 사람에게 연락한다  ④ 휴대전화를 버린다",
]
add_question_table(doc, daily, 21)

# Examiner script.
page_break(doc)
add_heading(doc, "검사자용 작업기억 지시문", 1)
add_note_box(doc, "보안", "이 페이지는 피검자에게 미리 보여 주지 마십시오. 각 항목은 일정한 속도로 한 번 읽고, 필요하면 동일하게 한 번만 반복합니다.", fill="FFF5E6", accent="A86500")
script_rows = [
    (16, "같은 순서", "3 - 8", "3 - 8", "두 숫자를 모두 같은 순서로 말하면 1점"),
    (17, "같은 순서", "4 - 1 - 7", "4 - 1 - 7", "세 숫자를 모두 같은 순서로 말하면 1점"),
    (18, "같은 순서", "6 - 2 - 9 - 4", "6 - 2 - 9 - 4", "네 숫자를 모두 같은 순서로 말하면 1점"),
    (19, "거꾸로", "3 - 7 - 1", "1 - 7 - 3", "세 숫자를 모두 역순으로 말하면 1점"),
    (20, "행동 순서", "연필을 집고, 종이에 동그라미를 하나 그린 뒤, 연필을 내려놓으세요.", "제시된 세 행동을 순서대로 수행", "세 행동을 순서대로 모두 수행하면 1점"),
]
table = doc.add_table(rows=1, cols=5)
table.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(table, [650, 1350, 2650, 2050, 2660])
set_table_borders(table)
for i, h in enumerate(("번호", "방식", "검사자가 읽을 내용", "정답 행동/응답", "채점")):
    table.cell(0, i).text = h
    set_cell_shading(table.cell(0, i), NAVY)
    format_cell_text(table.cell(0, i), 8.5, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
set_repeat_table_header(table.rows[0])
for row_data in script_rows:
    cells = table.add_row().cells
    for i, value in enumerate(row_data):
        cells[i].text = str(value)
        format_cell_text(cells[i], 8.8, i == 0, NAVY if i == 0 else TEXT, WD_ALIGN_PARAGRAPH.CENTER if i < 2 else WD_ALIGN_PARAGRAPH.LEFT)

add_heading(doc, "실시 관찰기록", 2)
for label in ("반복 제공 문항", "사용한 응답 방식/보조기기", "피로·불안·주의 변화", "감각·운동·언어 요인의 영향", "기타 관찰"):
    p = doc.add_paragraph()
    r = p.add_run(label + ": ")
    set_run(r, 10, True, NAVY)
    r = p.add_run("________________________________________________________________________________")
    set_run(r, 10, False, MUTED)

# Answer key.
page_break(doc)
add_heading(doc, "정답 및 채점 기준", 1)
add_note_box(doc, "기본 채점", "정답 1점, 오답 0점으로 총 25점입니다. ‘실시불가’는 0점과 구분하여 기록하고, 총점 해석 시 실시불가 사유를 반드시 함께 기술합니다.")
answers = [
    (1, "언어", "쉬움", "① 우산", "1점"),
    (2, "언어", "쉬움", "① 정한 일을 한다", "1점"),
    (3, "언어", "보통", "② 사람을 이동시킨다", "1점"),
    (4, "언어", "보통", "① 아무도 없을 수 있다", "1점"),
    (5, "언어", "어려움", "① 공이 들어 있다", "1점"),
    (6, "수리", "쉬움", "② 5", "1점"),
    (7, "수리", "쉬움", "③ 6", "1점"),
    (8, "수리", "보통", "③ 12", "1점"),
    (9, "수리", "보통", "③ 1,000원", "1점"),
    (10, "수리", "어려움", "② 4개, 2개 남음", "1점"),
    (11, "도형", "쉬움", "① ○", "1점"),
    (12, "도형", "쉬움", "① □", "1점"),
    (13, "도형", "보통", "③ ▲▲▲▲", "1점"),
    (14, "도형", "보통", "① ○", "1점"),
    (15, "도형", "어려움", "④ ←", "1점"),
    (16, "기억", "쉬움", "3-8", "완전 일치 1점"),
    (17, "기억", "쉬움", "4-1-7", "완전 일치 1점"),
    (18, "기억", "보통", "6-2-9-4", "완전 일치 1점"),
    (19, "기억", "보통", "1-7-3", "완전 일치 1점"),
    (20, "기억", "어려움", "세 행동을 순서대로 수행", "완전 수행 1점"),
    (21, "일상", "쉬움", "① 식사 후", "1점"),
    (22, "일상", "쉬움", "② 초록불을 기다린다", "1점"),
    (23, "일상", "보통", "③ 1,800원", "1점"),
    (24, "일상", "보통", "② 1시 20분", "1점"),
    (25, "일상", "어려움", "③ 도움 요청/연락", "1점"),
]
table = doc.add_table(rows=1, cols=5)
table.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(table, [650, 1150, 1100, 4200, 2260])
set_table_borders(table)
for i, h in enumerate(("번호", "영역", "난이도", "정답", "채점")):
    table.cell(0, i).text = h
    set_cell_shading(table.cell(0, i), NAVY)
    format_cell_text(table.cell(0, i), 8.5, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
set_repeat_table_header(table.rows[0])
for idx, row_data in enumerate(answers):
    cells = table.add_row().cells
    for i, value in enumerate(row_data):
        cells[i].text = str(value)
        if idx % 2:
            set_cell_shading(cells[i], "F8FAFB")
        format_cell_text(cells[i], 8.5, i == 0, NAVY if i == 0 else TEXT, WD_ALIGN_PARAGRAPH.CENTER if i != 3 else WD_ALIGN_PARAGRAPH.LEFT)

# Scoring summary.
page_break(doc)
add_heading(doc, "영역별 채점표", 1)
score_table = doc.add_table(rows=1, cols=5)
score_table.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(score_table, [2400, 1800, 1800, 1800, 1560])
set_table_borders(score_table)
for i, h in enumerate(("영역", "해당 문항", "점수", "실시불가 수", "비고")):
    score_table.cell(0, i).text = h
    set_cell_shading(score_table.cell(0, i), NAVY)
    format_cell_text(score_table.cell(0, i), 9, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
for domain, nums in (("언어이해", "1–5"), ("수리추론", "6–10"), ("도형·규칙추론", "11–15"), ("작업기억", "16–20"), ("일상 문제해결", "21–25"), ("총점", "1–25")):
    cells = score_table.add_row().cells
    values = (domain, nums, "____ / 5" if domain != "총점" else "____ / 25", "____", "")
    for i, value in enumerate(values):
        cells[i].text = value
        if domain == "총점":
            set_cell_shading(cells[i], LIGHT_TEAL)
        format_cell_text(cells[i], 9.5, domain == "총점" or i == 0, TEAL if domain == "총점" else TEXT, WD_ALIGN_PARAGRAPH.CENTER)

add_heading(doc, "기술적 수준 구분", 1)
p = doc.add_paragraph()
p.add_run("아래 구분은 규준이나 진단 기준이 아니라, 이 25문항에서 관찰된 수행을 기록하기 위한 임시 기술 범주입니다. 연령·교육·문화·언어·감각·운동 조건에 따라 결과가 달라질 수 있습니다.")
levels = doc.add_table(rows=1, cols=4)
levels.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(levels, [1450, 1450, 3150, 3310])
set_table_borders(levels)
for i, h in enumerate(("총점", "표시", "기술", "권장 조치")):
    levels.cell(0, i).text = h
    set_cell_shading(levels.cell(0, i), NAVY)
    format_cell_text(levels.cell(0, i), 9, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
level_rows = [
    ("0–8", "쉬운 문항 중심 지원 필요", "쉬운 난이도 문항에서도 정답이 제한적으로 관찰됨", "짧은 지시, 시범, 반복, 그림·실물 단서 제공"),
    ("9–17", "보통 수준 문항 일부 수행", "쉬운 문항과 일부 보통 난이도 문항을 수행함", "한 단계씩 설명하고 영역별 강·약점에 맞춰 지원"),
    ("18–25", "어려운 문항까지 수행", "보통·어려운 난이도 문항까지 비교적 폭넓게 수행함", "복합 지시와 확장 과제를 단계적으로 제공"),
]
for row_data in level_rows:
    cells = levels.add_row().cells
    for i, value in enumerate(row_data):
        cells[i].text = value
        format_cell_text(cells[i], 9, i < 2, NAVY if i < 2 else TEXT, WD_ALIGN_PARAGRAPH.CENTER if i < 2 else WD_ALIGN_PARAGRAPH.LEFT)

add_heading(doc, "영역별 참고", 2)
domain_guidance = doc.add_table(rows=1, cols=3)
domain_guidance.alignment = WD_TABLE_ALIGNMENT.LEFT
set_table_geometry(domain_guidance, [1800, 1650, 5910])
set_table_borders(domain_guidance)
for i, h in enumerate(("영역 점수", "기술", "해석 시 유의")):
    domain_guidance.cell(0, i).text = h
    set_cell_shading(domain_guidance.cell(0, i), NAVY)
    format_cell_text(domain_guidance.cell(0, i), 9, True, WHITE, WD_ALIGN_PARAGRAPH.CENTER)
for row_data in (
    ("0–1 / 5", "지원 필요가 많이 관찰됨", "실시불가·언어이해·감각·운동 요인의 영향을 먼저 검토"),
    ("2–3 / 5", "부분 수행이 관찰됨", "맞힌 문항의 난이도와 사용한 도움을 함께 기록"),
    ("4–5 / 5", "독립 수행이 주로 관찰됨", "이 도구보다 복잡한 실제 상황에서도 같은지 별도 확인"),
):
    cells = domain_guidance.add_row().cells
    for i, value in enumerate(row_data):
        cells[i].text = value
        format_cell_text(cells[i], 9.2, i == 0, NAVY if i == 0 else TEXT, WD_ALIGN_PARAGRAPH.CENTER if i < 2 else WD_ALIGN_PARAGRAPH.LEFT)

add_heading(doc, "결과 기록문 예시", 2)
add_note_box(doc, "권장 표현", "‘본 연구용 선별지에서 총 25문항 중 14문항을 수행하였다. 일상 문제해결 영역은 비교적 독립적으로 수행했으며, 작업기억 문항에서는 지시 반복이 필요했다. 이는 IQ나 장애 정도를 의미하지 않는다.’", fill=LIGHT_TEAL, accent=TEAL)
add_note_box(doc, "금지 표현", "‘IQ가 낮다’, ‘지적장애이다’, ‘경도/중등도 지적장애에 해당한다’처럼 진단 또는 IQ를 추정하는 표현은 사용하지 마십시오.", fill="FDECEC", accent="9B1C1C")

add_heading(doc, "연구 사용 전 점검", 1)
checks = [
    "□ 연구 대상 연령·언어 수준에 맞는지 예비조사를 실시했다.",
    "□ 최소 두 명의 전문가가 문항의 내용타당도와 편향 가능성을 검토했다.",
    "□ 접근성 조정과 실시불가 처리 규칙을 연구계획서에 명시했다.",
    "□ 연구윤리 심의와 참여자·보호자 동의 절차를 확인했다.",
    "□ 결과를 IQ, 진단 또는 행정상 장애 정도로 변환하지 않는다.",
]
for text in checks:
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.15)
    r = p.add_run(text)
    set_run(r, 10.2)

doc.core_properties.title = "연구용 인지능력 선별지 25문항"
doc.core_properties.subject = "비표준화 연구용 인지과제 수행 선별지"
doc.core_properties.author = "OpenAI Codex 초안"
doc.core_properties.keywords = "인지능력, 연구용, 선별지, 비진단"
doc.core_properties.comments = "표준화된 지능검사가 아니며 IQ 또는 지적장애 판정에 사용할 수 없음"

doc.save(OUT)
print(OUT)
