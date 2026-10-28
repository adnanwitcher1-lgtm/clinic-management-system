"""Prescription / receipt PDFs (A4, patient copy, outside-medicines sheet, 80mm thermal)."""
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.core.models import ClinicSettings

BRAND = colors.HexColor("#3b3fc7")
ACCENT = colors.HexColor("#8b3fd0")
SOFT = colors.HexColor("#f1efff")
INK = colors.HexColor("#1f2340")
MUTED = colors.HexColor("#6b7090")
LINE = colors.HexColor("#dcd9f5")
WARN = colors.HexColor("#fff4e5")
WARN_LINE = colors.HexColor("#f5902b")


def P(text, size=9, bold=False, color=INK, align=None, leading=None, **kw):
    style = ParagraphStyle(
        "x", fontName="Helvetica-Bold" if bold else "Helvetica", fontSize=size, textColor=color,
        leading=leading or size * 1.3, alignment=align if align is not None else 0, **kw,
    )
    return Paragraph(escape(str(text)) if not str(text).startswith("<") else str(text), style)


def esc(s):
    return escape(str(s or ""))


def money(cfg, v):
    return f"{cfg.currency} {Decimal(v or 0):,.0f}"


def _lines(item):
    return [x for x in [item.dose, item.frequency, item.duration] if x]


# ------------------------------------------------------------------ A4 layouts
def _header(cfg, width):
    left = [P(cfg.clinic_name, 20, True, BRAND, leading=24)]
    if cfg.tagline:
        left.append(P(cfg.tagline, 8.5, False, MUTED))
    right = P("<font>" + "<br/>".join(esc(x) for x in [cfg.address, f"Ph: {cfg.phone}" if cfg.phone else "", cfg.email] if x) + "</font>", 8.5, False, MUTED, align=TA_RIGHT)
    t = Table([[left, right]], colWidths=[width * 0.6, width * 0.4])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, 0), 2, BRAND), ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (-1, 0), (-1, 0), 0)]))
    return t


def _kv_table(rows, width, cols=4):
    """rows: list of (label, value) rendered in `cols`/2 pairs per line."""
    per = cols // 2
    data, line = [], []
    for label, value in rows:
        line += [P(label, 7.5, True, MUTED), P(value or "-", 9, False, INK)]
        if len(line) == cols:
            data.append(line)
            line = []
    if line:
        data.append(line + [""] * (cols - len(line)))
    cw = [width * 0.14, width * 0.36] * per
    t = Table(data, colWidths=cw)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE), ("BOX", (0, 0), (-1, -1), 0.6, LINE)]))
    return t


def _vitals_table(v, cfg, width):
    vit = getattr(v, "vitals", None)
    cells = [
        ("BP", f"{vit.bp} mmHg" if vit and vit.bp else "-"),
        ("Sugar", f"{vit.sugar} mg/dL ({vit.sugar_type})" if vit and vit.sugar else "-"),
        ("Weight", f"{vit.weight} kg" if vit and vit.weight else "-"),
        ("Temp", f"{vit.temperature} °F" if vit and vit.temperature else "-"),
        ("Pulse", f"{vit.pulse} /min" if vit and vit.pulse else "-"),
    ]
    data = [[P(k, 7.5, True, MUTED, align=TA_CENTER) for k, _ in cells], [P(val, 9, True, BRAND, align=TA_CENTER) for _, val in cells]]
    t = Table(data, colWidths=[width / 5] * 5)
    t.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return t


def _section_title(text, color=BRAND):
    return P(text, 10.5, True, color, spaceBefore=10, spaceAfter=4)


def _med_table(items, width, with_qty=False, warn=False):
    head = ["#", "Medicine", "Dose", "Frequency", "Duration", "Instructions"] + (["Qty"] if with_qty else [])
    cw = [0.05, 0.30, 0.12, 0.16, 0.12, 0.25] if not with_qty else [0.05, 0.27, 0.11, 0.15, 0.11, 0.24, 0.07]
    data = [[P(h, 8, True, colors.white) for h in head]]
    for n, i in enumerate(items, 1):
        row = [P(n, 9), P(f"<b>{esc(i.name)}</b> <font color='#6b7090'>{esc(i.strength)} {esc(i.form)}</font>", 9), P(i.dose or "-", 9), P(i.frequency or "-", 9), P(i.duration or "-", 9), P(i.instructions or "-", 9)]
        if with_qty:
            row.append(P(i.quantity, 9, True, align=TA_CENTER))
        data.append(row)
    t = Table(data, colWidths=[width * c for c in cw], repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), WARN_LINE if warn else BRAND), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, WARN if warn else SOFT]), ("BOX", (0, 0), (-1, -1), 0.6, WARN_LINE if warn else LINE), ("LINEBELOW", (0, 1), (-1, -1), 0.3, LINE), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    t.setStyle(TableStyle(style))
    return t


def _inj_summary(inj):
    bits = [inj.route]
    if inj.diluent:
        bits.append(f"in {inj.diluent}")
    sched = " · ".join(x for x in [inj.frequency, inj.duration] if x)
    if sched:
        bits.append(sched)
    if inj.doses and inj.doses > 1:
        bits.append(f"{inj.doses} doses")
    return "  |  ".join(bits)


def _inj_table(inj, n, width, outside_only=False, show_price=False, cfg=None):
    """One injection order (single drug or MIX) as a boxed table."""
    comps = list(inj.components.all())
    if outside_only:
        comps = [c for c in comps if c.source == "outside"]
    mix = len(list(inj.components.all())) > 1
    title = f"Injection {n}" + (f" · MIX of {len(list(inj.components.all()))} drugs in one syringe/drip" if mix else "") + (f" · {inj.label}" if inj.label else "")
    head = [[P(title, 9.5, True, colors.white), "", "", ""]]
    rows = [[P("Drug", 7.5, True, MUTED), P("Per dose", 7.5, True, MUTED), P("Qty", 7.5, True, MUTED, align=TA_CENTER), P("Supply", 7.5, True, MUTED)]]
    for c in comps:
        rows.append([P(f"<b>{esc(c.name)}</b> <font color='#6b7090'>{esc(c.strength)} {esc(c.form)}</font>", 9), P(c.amount or "-", 9), P(c.quantity, 9, True, align=TA_CENTER),
                     P("Clinic store" if c.source == "store" else "Buy outside", 8.5, False, BRAND if c.source == "store" else WARN_LINE)])
    foot = [[P(esc(_inj_summary(inj)) + (f"  |  Note: {esc(inj.notes)}" if inj.notes else ""), 8.5, False, INK), "", "", ""]]
    data = head + rows + foot
    last = len(data) - 1
    t = Table(data, colWidths=[width * 0.46, width * 0.2, width * 0.1, width * 0.24], repeatRows=0)
    t.setStyle(TableStyle([
        ("SPAN", (0, 0), (-1, 0)), ("BACKGROUND", (0, 0), (-1, 0), ACCENT), ("SPAN", (0, last), (-1, last)), ("BACKGROUND", (0, last), (-1, last), SOFT),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("LINEBELOW", (0, 1), (-1, last - 1), 0.3, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _inj_story(rx, w, outside_only=False):
    injs = list(rx.injections.all())
    if outside_only:
        injs = [i for i in injs if any(c.source == "outside" for c in i.components.all())]
    if not injs:
        return []
    title = "Injections · drugs to buy from outside (bring them to the clinic)" if outside_only else "Injections · given at the clinic"
    story = [_section_title(title, WARN_LINE if outside_only else ACCENT)]
    for n, inj in enumerate(injs, 1):
        story += [_inj_table(inj, n, w, outside_only=outside_only), Spacer(1, 5)]
    return story


def _patient_rows(v, cfg):
    p = v.patient
    return [
        ("Patient No", p.patient_no), ("Date", f"{v.visit_date:%d %b %Y}"),
        ("Name", p.name), ("Token", f"#{v.token_no}"),
        ("Age / Sex", f"{p.age} / {p.get_gender_display()}"), ("Doctor", f"Dr. {v.doctor.display_name}"),
        ("Phone", p.phone), ("Blood group", p.blood_group),
    ]


def _signature(v, width):
    d = v.doctor
    sig = [P("_" * 32, 9, align=TA_RIGHT), P(f"<b>Dr. {esc(d.display_name)}</b>", 9, align=TA_RIGHT)]
    if d.qualification or d.specialization:
        sig.append(P(esc(" · ".join(x for x in [d.qualification, d.specialization] if x)), 8, False, MUTED, align=TA_RIGHT))
    return sig


def _footer(canvas, doc, cfg=None):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(doc.pagesize[0] / 2, 8 * mm, f"{cfg.clinic_name if cfg else ''}  ·  Computer generated prescription  ·  Page {doc.page}")
    canvas.restoreState()


def build_a4(rx, cfg, mode="all"):
    """mode: 'all' (everything) · 'inside' (clinic-store medicines + injections) · 'outside' (medicines to buy outside)."""
    only_outside, only_inside = mode == "outside", mode == "inside"
    v = rx.visit
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=12 * mm, bottomMargin=16 * mm, title=f"Prescription {v.patient.patient_no}")
    w = doc.width
    story = [_header(cfg, w), Spacer(1, 6)]
    if only_outside:
        story += [P("Prescription – medicines to buy from an outside pharmacy", 11, True, WARN_LINE), Spacer(1, 4)]
    elif only_inside:
        story += [P("Clinic medicines & injections – collect / receive at the clinic with your token", 11, True, BRAND), Spacer(1, 4)]
    story.append(_kv_table(_patient_rows(v, cfg), w))
    if v.patient.allergies:
        story += [Spacer(1, 4), P(f"<font color='#d92b4b'><b>Allergies:</b></font> {esc(v.patient.allergies)}", 9)]
    if not only_outside:
        story += [Spacer(1, 6), _vitals_table(v, cfg, w)]
        if v.complaints or v.notes:
            story.append(_section_title("Complaints / Notes"))
            story.append(P(esc(v.complaints), 9))
            if v.notes:
                story.append(P(esc(v.notes), 9, color=MUTED))
        if v.diagnosis:
            story += [_section_title("Diagnosis"), P(esc(v.diagnosis), 10, True)]
    items = list(rx.items.all())
    store = [i for i in items if i.source == "store"]
    outside = [i for i in items if i.source == "outside"]
    injections = list(rx.injections.all())
    story.append(Spacer(1, 2))
    if store and not only_outside:
        story += [_section_title("Rx · Available in clinic store (collect with your token)"), _med_table(store, w, with_qty=True)]
    if outside and not only_inside:
        story += [_section_title("Rx · Write from outside (buy from any pharmacy)", WARN_LINE), _med_table(outside, w, warn=True)]
    story += _inj_story(rx, w, outside_only=only_outside)
    shown = (not only_outside and (store or injections)) or (not only_inside and outside) or (only_outside and any(c.source == "outside" for i in injections for c in i.components.all()))
    if not shown:
        story.append(P("Nothing to show on this copy." if (items or injections) else "No medicines prescribed.", 9, color=MUTED))
    if rx.advice and not only_outside:
        story += [_section_title("Advice"), P(esc(rx.advice), 9)]
    if v.follow_up_date and not only_outside:
        story += [Spacer(1, 6), P(f"<b>Follow-up date:</b> {v.follow_up_date:%A, %d %b %Y}", 10, color=BRAND)]
    story += [Spacer(1, 26)] + _signature(v, w)
    footer = lambda c, d: _footer(c, d, cfg)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


def build_patient_copy(rx, cfg):
    v = rx.visit
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=12 * mm, bottomMargin=16 * mm, title="Patient copy")
    w = doc.width
    token = Table([[P(f"<font size=9 color='#6b7090'>YOUR TOKEN</font><br/><font size=26 color='#3b3fc7'><b>#{v.token_no}</b></font>", 9, align=TA_CENTER)]], colWidths=[w * 0.22])
    token.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1, BRAND), ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    top = Table([[[P("PATIENT COPY", 9, True, ACCENT), P(esc(v.patient.name), 17, True, INK, leading=21), P(f"{v.patient.patient_no} · {v.patient.age} yrs · {v.patient.get_gender_display()} · {v.visit_date:%d %b %Y}", 9, False, MUTED), P(f"Doctor: Dr. {esc(v.doctor.display_name)}", 9, False, MUTED)], token]], colWidths=[w * 0.76, w * 0.24])
    top.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    story = [_header(cfg, w), Spacer(1, 8), top, Spacer(1, 6)]
    if v.diagnosis:
        story.append(P(f"<b>Diagnosis:</b> {esc(v.diagnosis)}", 10))
    for title, group, color in (("Take these medicines", [i for i in rx.items.all() if i.source == "store"], BRAND), ("Buy from outside pharmacy", [i for i in rx.items.all() if i.source == "outside"], WARN_LINE)):
        if not group:
            continue
        story.append(_section_title(title, color))
        for i in group:
            sched = "  ·  ".join(x for x in [i.dose, i.frequency, i.duration] if x) or "-"
            card = Table([[P(f"<b>{esc(i.name)}</b> <font color='#6b7090'>{esc(i.strength)} {esc(i.form)}</font>", 11)], [P(esc(sched), 10, True, color)], [P(esc(i.instructions), 9, False, MUTED)]], colWidths=[w])
            card.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("BACKGROUND", (0, 0), (-1, -1), WARN if color == WARN_LINE else SOFT), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 8)]))
            story += [card, Spacer(1, 4)]
    for n, inj in enumerate(rx.injections.all(), 1):
        if n == 1:
            story.append(_section_title("Injections", ACCENT))
        comps = " + ".join(f"{c.name} {c.strength}".strip() + (f" ({c.amount})" if c.amount else "") + ("" if c.source == "store" else " [outside]") for c in inj.components.all())
        card = Table([[P(f"<b>{esc(inj.label or ('Mix' if inj.is_mix else 'Injection'))}</b> · {esc(inj.route)}", 11)], [P(esc(comps), 10, True, ACCENT)], [P(esc(_inj_summary(inj)), 9, False, MUTED)]], colWidths=[w])
        card.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("BACKGROUND", (0, 0), (-1, -1), SOFT), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 8)]))
        story += [card, Spacer(1, 4)]
    if rx.advice:
        story += [_section_title("Doctor's advice"), P(esc(rx.advice), 10)]
    if v.follow_up_date:
        story += [Spacer(1, 6), P(f"<b>Next visit:</b> {v.follow_up_date:%A, %d %b %Y}", 11, color=BRAND)]
    story += [Spacer(1, 14), P("Please keep this copy and bring it on your next visit.", 8.5, False, MUTED)]
    footer = lambda c, d: _footer(c, d, cfg)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


# ------------------------------------------------------------------ thermal 80mm
THERMAL_W = 80 * mm


def _measure(story, width):
    total = 0
    for f in story:
        _, h = f.wrap(width, 10000)
        total += h + f.getSpaceBefore() + f.getSpaceAfter()
    return total


def _thermal_build(story, title):
    inner = THERMAL_W - 8 * mm
    height = _measure(story, inner) + 14 * mm
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=(THERMAL_W, height), leftMargin=4 * mm, rightMargin=4 * mm, topMargin=4 * mm, bottomMargin=4 * mm, title=title)
    doc.build(story)
    return buf.getvalue()


def _tp(text, size=8, bold=False, align=TA_CENTER):
    return P(text, size, bold, colors.black, align=align, leading=size * 1.25)


def _two_col(a, b, bold=False, size=8):
    t = Table([[_tp(a, size, bold, 0), _tp(b, size, bold, TA_RIGHT)]], colWidths=[(THERMAL_W - 8 * mm) * 0.68, (THERMAL_W - 8 * mm) * 0.32])
    t.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)]))
    return t


def _dash():
    return HRFlowable(width="100%", thickness=0.6, color=colors.black, dash=(2, 2), spaceBefore=3, spaceAfter=3)


def _thermal_head(cfg, v, title_big):
    story = [_tp(cfg.clinic_name, 13, True), _tp(cfg.address, 7), _tp(f"Ph: {cfg.phone}" if cfg.phone else "", 7), _dash(), _tp(title_big, 8, True), _tp(f"#{v.token_no}", 26, True), _dash()]
    story += [_two_col("Patient", v.patient.name, True), _two_col("Pt No", v.patient.patient_no), _two_col("Age/Sex", f"{v.patient.age}/{v.patient.get_gender_display()[0]}"), _two_col("Doctor", f"Dr. {v.doctor.display_name}"), _two_col("Date", f"{v.visit_date:%d-%m-%Y}")]
    return story


def build_thermal(rx, cfg):
    """INSIDE receipt: clinic-store medicines + injections + bill. Outside medicines print on their own slip."""
    v = rx.visit
    story = _thermal_head(cfg, v, "TOKEN")
    if v.diagnosis:
        story += [_dash(), _tp(f"Dx: {v.diagnosis}", 8, False, 0)]
    store = [i for i in rx.items.all() if i.source == "store"]
    injections = list(rx.injections.all())
    story.append(_dash())
    if store:
        story.append(_tp("MEDICINES (clinic store)", 8, True, 0))
        for i in store:
            qty = i.dispensed_qty if rx.dispensed_at else i.quantity
            story.append(_two_col(f"{qty} x {i.label}", money(cfg, i.unit_price * qty)))
            sched = " ".join(x for x in [i.dose, i.frequency, i.duration] if x)
            if sched or i.instructions:
                story.append(_tp(f"  {sched} {i.instructions}".strip(), 7, False, 0))
    if injections:
        if store:
            story.append(_dash())
        story.append(_tp("INJECTIONS", 8, True, 0))
        for n, inj in enumerate(injections, 1):
            comps = list(inj.components.all())
            story.append(_tp(f"{n}. {'MIX' if len(comps) > 1 else 'Inj'} ({inj.route}){' - ' + inj.label if inj.label else ''}", 8, True, 0))
            for c in comps:
                if c.source == "store":
                    qty = c.dispensed_qty if rx.dispensed_at else c.quantity
                    story.append(_two_col(f"  {qty} x {c.label}", money(cfg, c.unit_price * qty), size=7.5))
                else:
                    story.append(_tp(f"  {c.label} (bring from outside)", 7.5, False, 0))
            extra = " ".join(x for x in [f"in {inj.diluent}" if inj.diluent else "", inj.frequency, inj.duration] if x)
            if extra:
                story.append(_tp(f"  {extra}", 7, False, 0))
            if inj.admin_fee:
                story.append(_two_col("  Injection charge", money(cfg, inj.admin_fee), size=7.5))
    if not store and not injections:
        story.append(_tp("No clinic medicines / injections", 7.5, False, 0))
    story.append(_dash())
    story += [_two_col("Consultation", money(cfg, v.consultation_fee)), _two_col("Medicines", money(cfg, v.medicine_total))]
    if injections:
        story.append(_two_col("Injections", money(cfg, v.injection_total)))
    story += [_two_col("TOTAL", money(cfg, v.total_due), True, 9), _two_col("Paid", money(cfg, v.paid_amount))]
    if v.balance > 0:
        story.append(_two_col("DUE", money(cfg, v.balance), True, 9))
    if v.follow_up_date:
        story += [_dash(), _tp(f"Follow-up: {v.follow_up_date:%d-%m-%Y}", 8, True)]
    if any(i.source == "outside" for i in rx.items.all()):
        story += [_dash(), _tp("Outside medicines are on a separate slip.", 7.5)]
    story += [_dash(), _tp("Collect medicine with your token no.", 7.5), _tp("Get well soon!", 8, True)]
    return _thermal_build(story, f"Receipt #{v.token_no}")


def build_outside_thermal(rx, cfg):
    """OUTSIDE slip (80mm): only the medicines / injection drugs the patient must buy elsewhere. No prices."""
    v = rx.visit
    story = _thermal_head(cfg, v, "OUTSIDE MEDICINES")
    story.append(_dash())
    outside = [i for i in rx.items.all() if i.source == "outside"]
    for n, i in enumerate(outside, 1):
        story.append(_tp(f"{n}. {i.label}", 8, True, 0))
        sched = " ".join(x for x in [i.dose, i.frequency, i.duration, i.instructions] if x)
        if sched:
            story.append(_tp(f"   {sched}", 7, False, 0))
    inj_out = [(inj, [c for c in inj.components.all() if c.source == "outside"]) for inj in rx.injections.all()]
    inj_out = [(inj, cs) for inj, cs in inj_out if cs]
    if inj_out:
        if outside:
            story.append(_dash())
        story.append(_tp("INJECTION DRUGS (bring to clinic)", 8, True, 0))
        for inj, cs in inj_out:
            for c in cs:
                story.append(_tp(f"- {c.label} x{c.quantity}" + (f" ({c.amount})" if c.amount else ""), 7.5, False, 0))
            story.append(_tp(f"   for {inj.route} {'mix' if inj.is_mix else 'injection'}", 7, False, 0))
    if not outside and not inj_out:
        story.append(_tp("Nothing to buy from outside.", 8))
    if rx.advice:
        story += [_dash(), _tp(f"Advice: {rx.advice}", 7.5, False, 0)]
    story += [_dash(), _tp("Buy from any pharmacy", 7.5), _tp("Get well soon!", 8, True)]
    return _thermal_build(story, f"Outside Rx #{v.token_no}")


def build_token_slip(visit, cfg):
    story = [_tp(cfg.clinic_name, 13, True), _tp(cfg.address, 7), _dash(), _tp("YOUR TOKEN", 9, True), _tp(f"#{visit.token_no}", 34, True), _dash(),
             _two_col("Patient", visit.patient.name, True), _two_col("Pt No", visit.patient.patient_no), _two_col("Doctor", f"Dr. {visit.doctor.display_name}"),
             _two_col("Date", f"{visit.visit_date:%d-%m-%Y}"), _two_col("Time", f"{visit.created_at.astimezone():%I:%M %p}"), _two_col("Fee", money(cfg, visit.consultation_fee)), _dash(), _tp("Please wait for your number.", 7.5)]
    return _thermal_build(story, f"Token {visit.token_no}")


def build_prescription_pdf(rx, layout="a4"):
    cfg = ClinicSettings.load()
    if layout == "thermal":
        return build_thermal(rx, cfg)
    if layout == "patient":
        return build_patient_copy(rx, cfg)
    if layout == "outside":
        return build_a4(rx, cfg, mode="outside")
    if layout == "inside":
        return build_a4(rx, cfg, mode="inside")
    if layout == "outside_thermal":
        return build_outside_thermal(rx, cfg)
    return build_a4(rx, cfg)
