import os
import re
import io
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib import colors
from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Template rendering helpers
# ---------------------------------------------------------------------------

def _render_template(html: str, context: dict) -> str:
    """
    Resolve Jinja2-style {{ var }} placeholders and {% if var %} … {% endif %}
    blocks.  Only the subset used in the admission letter template is supported.
    """
    # ---- 1. Handle {% if var %} … {% endif %} blocks ----------------------
    # Pattern: {% if VAR %} content {% endif %}
    # If context[VAR] is truthy keep content, otherwise remove the whole block.
    def replace_if_block(m):
        var_name = m.group(1).strip()
        inner    = m.group(2)
        return inner if context.get(var_name) else ""

    html = re.sub(
        r'\{%-?\s*if\s+(\w+)\s*-?%\}(.*?)\{%-?\s*endif\s*-?%\}',
        replace_if_block,
        html,
        flags=re.DOTALL,
    )

    # ---- 2. Replace {{ var }} placeholders --------------------------------
    def replace_var(m):
        var_name = m.group(1).strip()
        return str(context.get(var_name, ""))

    html = re.sub(r'\{\{\s*(\w+)\s*\}\}', replace_var, html)

    return html


# ---------------------------------------------------------------------------
# ReportLab flowable builder for the new template structure
# ---------------------------------------------------------------------------

class NewTemplateParser:
    """
    Convert the new JUPEB admission-letter HTML into ReportLab flowables.
    The layout is driven by named sections recognised via class / structure,
    not a generic recursive walk, so that table-based content renders correctly.
    """

    PAGE_WIDTH  = A4[0] - 2 * 1.5 * cm   # usable width (1.5 cm side margins)
    LOGO_SIZE   = 2.0 * cm

    def __init__(self):
        self.flowables = []
        self._styles   = getSampleStyleSheet()
        self._add_styles()

    # ------------------------------------------------------------------
    # Style definitions
    # ------------------------------------------------------------------
    def _add_styles(self):
        S = self._styles

        def add(name, **kw):
            parent = kw.pop("parent", S["Normal"])
            S.add(ParagraphStyle(name=name, parent=parent, **kw))

        add("UnivTitle",   fontSize=13, fontName="Helvetica-Bold",
            alignment=TA_CENTER, spaceAfter=2)
        add("UnivAddress", fontSize=8,  fontName="Helvetica",
            alignment=TA_CENTER, leading=10, spaceAfter=0)
        add("RegTitle",    fontSize=11, fontName="Helvetica-Bold",
            alignment=TA_CENTER, spaceBefore=6, spaceAfter=6)
        add("RegLeft",     fontSize=8,  fontName="Helvetica", leading=12)
        add("RegRight",    fontSize=8,  fontName="Helvetica",
            alignment=TA_RIGHT, leading=12)
        add("Meta",        fontSize=9,  fontName="Helvetica")
        add("MetaRight",   fontSize=9,  fontName="Helvetica", alignment=TA_RIGHT)
        add("Salutation",  fontSize=10.5, fontName="Helvetica-Bold",
            spaceBefore=8, spaceAfter=6)
        add("Subject",     fontSize=11, fontName="Helvetica-Bold",
            alignment=TA_CENTER, spaceAfter=10, leading=14)
        add("Body",        fontSize=10.5, fontName="Helvetica",
            alignment=TA_JUSTIFY, leading=15, spaceAfter=0)
        add("BodyBold",    fontSize=10.5, fontName="Helvetica-Bold",
            alignment=TA_JUSTIFY, leading=15, spaceAfter=0)
        add("SubItem",     fontSize=10.5, fontName="Helvetica",
            alignment=TA_JUSTIFY, leading=15, spaceAfter=0)
        add("FeeItem",     fontSize=10.5, fontName="Helvetica-Bold",
            leading=15, spaceAfter=0)
        add("SigName",     fontSize=10.5, fontName="Helvetica-Bold", spaceAfter=0)
        add("Footer",      fontSize=8,  fontName="Helvetica",
            alignment=TA_CENTER,
            textColor=colors.HexColor("#64748b"), spaceBefore=12)

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def build(self, html: str, context: dict):
        """Render template, parse HTML, populate self.flowables."""
        rendered = _render_template(html, context)
        soup = BeautifulSoup(rendered, "html.parser")
        body = soup.find("body") or soup

        self._parse_body(body, context)

    # ------------------------------------------------------------------
    # Section dispatchers
    # ------------------------------------------------------------------
    def _parse_body(self, body, context):
        S = self._styles

        # --- Header table -----------------------------------------------
        header_tbl = body.find("table", class_="header-table")
        if header_tbl:
            self._build_header(header_tbl, context)

        # --- Office of the Registrar title ------------------------------
        reg_title = body.find(class_="registrar-title")
        if reg_title:
            self.flowables.append(
                Paragraph("OFFICE OF THE REGISTRAR", S["RegTitle"])
            )

        # --- Registrar details box (two-column table) ------------------
        reg_box = body.find("table", class_="registrar-box")
        if reg_box:
            self._build_registrar_box(reg_box)

        # --- Ref / Date meta table -------------------------------------
        meta_tbl = body.find("table", class_="meta-table")
        if meta_tbl:
            self._build_meta_table(meta_tbl)

        # --- Salutation ------------------------------------------------
        sal = body.find(class_="salutation")
        if sal:
            self.flowables.append(
                Paragraph(self._inline(sal), S["Salutation"])
            )

        # --- Subject ---------------------------------------------------
        subj = body.find(class_="subject")
        if subj:
            self.flowables.append(
                Paragraph(self._inline(subj), S["Subject"])
            )

        # --- Numbered body table ---------------------------------------
        # The main content is a single <table> without a special class,
        # located after the subject div.
        numbered_tbl = None
        if subj:
            for sib in subj.find_next_siblings():
                if sib.name == "table":
                    numbered_tbl = sib
                    break
        if numbered_tbl:
            self._build_numbered_table(numbered_tbl)

        # --- Signature -------------------------------------------------
        sig_div = body.find(class_="signature")
        if sig_div:
            self._build_signature(sig_div, context)

    # ------------------------------------------------------------------
    # Individual section builders
    # ------------------------------------------------------------------

    def _build_header(self, tbl, context):
        S = self._styles
        logo_cell = tbl.find("td", class_="header-logo-cell")
        text_cell = tbl.find("td", class_="header-text-cell")

        # Logo
        logo_img = None
        if context.get("logo_image"):
            try:
                img_data = base64.b64decode(context["logo_image"])
                buf = io.BytesIO(img_data)
                logo_img = Image(buf, width=self.LOGO_SIZE, height=self.LOGO_SIZE)
            except Exception:
                logo_img = None

        if logo_img is None:
            logo_img = Paragraph("<i>LOGO</i>", S["Normal"])

        # Text column
        title_para   = Paragraph("PRECIOUS CORNERSTONE UNIVERSITY", S["UnivTitle"])
        address_para = Paragraph(
            "Garden of Victory, Olaogun Street, Old Ife Road,<br/>"
            "P.M.B. 60, Agodi Post Office, Ibadan, Oyo State.<br/>"
            "A Tertiary Institution of The Sword of The Spirit Ministries",
            S["UnivAddress"],
        )

        usable = self.PAGE_WIDTH
        logo_w = self.LOGO_SIZE + 0.2 * cm
        text_w = usable - logo_w

        data = [[logo_img, [title_para, address_para]]]
        t = Table(data, colWidths=[logo_w, text_w])
        t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ]))
        self.flowables.append(t)

    def _build_registrar_box(self, tbl):
        S = self._styles
        cells = tbl.find_all("td")
        left_para = Paragraph(
            self._inline(cells[0]) if len(cells) > 0 else "",
            S["RegLeft"],
        )
        right_para = Paragraph(
            self._inline(cells[1]) if len(cells) > 1 else "",
            S["RegRight"],
        )
        usable = self.PAGE_WIDTH
        data = [[left_para, right_para]]
        t = Table(data, colWidths=[usable * 0.60, usable * 0.40])
        t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ]))
        self.flowables.append(t)

    def _build_meta_table(self, tbl):
        S = self._styles
        # Pull text from the two <td> cells
        cells = tbl.find_all("td")
        ref_text  = self._inline(cells[0]) if len(cells) > 0 else ""
        date_text = self._inline(cells[1]) if len(cells) > 1 else ""

        ref_para  = Paragraph(ref_text,  S["Meta"])
        date_para = Paragraph(date_text, S["MetaRight"])

        usable = self.PAGE_WIDTH
        data = [[ref_para, date_para]]
        t = Table(data, colWidths=[usable * 0.5, usable * 0.5])
        t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ]))
        self.flowables.append(t)

    def _build_numbered_table(self, tbl):
        """
        Build the numbered-paragraph table.  Each top-level <tr> has:
          col 0 – number (e.g. "1.")
          col 1 – content (may contain nested sub-tables)
        """
        S = self._styles
        usable = self.PAGE_WIDTH
        num_w  = 1.2 * cm
        body_w = usable - num_w

        rows = tbl.find_all("tr", recursive=False)
        table_data = []

        for row in rows:
            cells = row.find_all("td", recursive=False)
            if len(cells) < 2:
                continue

            num_text  = cells[0].get_text(strip=True)
            body_cell = cells[1]

            num_para = Paragraph(f"<b>{num_text}</b>", S["Body"])

            # Check for nested sub-table (documents list / fee table)
            nested_tbl = body_cell.find("table")
            if nested_tbl:
                content = self._build_nested_content(body_cell, nested_tbl, body_w)
            else:
                content = Paragraph(self._inline(body_cell), S["Body"])

            table_data.append([num_para, content])

        t = Table(table_data, colWidths=[num_w, body_w])
        t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 3),
        ]))
        self.flowables.append(t)

    def _build_nested_content(self, body_cell, nested_tbl, body_w):
        """
        Return a list of flowables for a cell that contains both intro text
        and a nested table (sub-list or fee table).
        """
        S = self._styles
        parts = []

        # Intro text before the nested table
        intro_parts = []
        for node in body_cell.children:
            if node == nested_tbl:
                break
            if isinstance(node, str):
                t = node.strip()
                if t:
                    intro_parts.append(t)
            elif hasattr(node, "get_text"):
                t = self._inline(node)
                if t:
                    intro_parts.append(t)

        if intro_parts:
            parts.append(Paragraph(" ".join(intro_parts), S["Body"]))

        # Determine sub-table type by class
        cls = " ".join(nested_tbl.get("class", []))
        if "fee-list" in cls:
            parts.append(self._build_fee_table(nested_tbl, body_w))
        else:
            # Sub-list (roman numerals)
            parts.append(self._build_sublist_table(nested_tbl, body_w))

        return parts

    def _build_sublist_table(self, tbl, parent_w):
        S = self._styles
        # indent from left edge, label column wide enough for "(viii.)" worst case
        indent  = 0.5 * cm
        num_w   = 1.4 * cm   # ~40pt — fits "(viii.)" without wrapping
        body_w  = parent_w - indent - num_w

        # SubItemLabel: same as SubItem but no word-wrap (nowrap via large leading)
        label_style = ParagraphStyle(
            "SubItemLabel",
            parent=S["SubItem"],
            wordWrap=None,   # disable word wrap so label stays on one line
        )

        rows = tbl.find_all("tr", recursive=False)
        data = []
        for row in rows:
            cells = row.find_all("td", recursive=False)
            if len(cells) < 2:
                continue
            # get_text() gives the raw text; strip() cleans whitespace
            label_text = cells[0].get_text().strip()
            num  = Paragraph(label_text, label_style)
            body = Paragraph(self._inline(cells[1]), S["SubItem"])
            data.append([num, body])

        t = Table(data, colWidths=[num_w, body_w])
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (0, -1), indent),
            ("LEFTPADDING",   (1, 0), (1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]))
        return t

    def _build_fee_table(self, tbl, parent_w):
        S = self._styles
        indent = 1.5 * cm
        label_w = 7.0 * cm
        amt_w   = parent_w - indent - label_w

        rows = tbl.find_all("tr", recursive=False)
        data = []
        for row in rows:
            cells = row.find_all("td", recursive=False)
            if len(cells) < 2:
                continue
            label = Paragraph(self._inline(cells[0]), S["FeeItem"])
            amt   = Paragraph(self._inline(cells[1]), S["FeeItem"])
            data.append([label, amt])

        t = Table(data, colWidths=[label_w, amt_w])
        t.setStyle(TableStyle([
            ("VALIGN",       (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",  (0, 0), (0, -1), indent),
            ("LEFTPADDING",  (1, 0), (1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING",   (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 1),
        ]))
        return t

    def _build_signature(self, sig_div, context):
        S = self._styles
        # Signature image
        if context.get("sig_image"):
            try:
                img_data = base64.b64decode(context["sig_image"])
                buf = io.BytesIO(img_data)
                sig_img = Image(buf, height=1.0 * cm, hAlign="LEFT")
                sig_img.hAlign = "LEFT"
                self.flowables.append(Spacer(1, 0.15 * cm))
                self.flowables.append(sig_img)
            except Exception:
                pass
        signature_text = self._inline(sig_div)
        if signature_text:
            self.flowables.append(Paragraph(signature_text, S["Body"]))
        else:
            self.flowables.append(
                Paragraph("<b>Mrs. Morenike F. Afolabi</b>", S["SigName"])
            )
            self.flowables.append(Paragraph("Registrar", S["Body"]))

    # ------------------------------------------------------------------
    # Utility: extract inline ReportLab-safe markup from a BS4 element
    # ------------------------------------------------------------------
    def _inline(self, element) -> str:
        """
        Walk element children and return a ReportLab-safe markup string.

        Raw text nodes are kept as-is (whitespace collapsed but not stripped)
        so that punctuation like "(i.)" is never broken into "( i . )".
        Parts are joined with "" so natural whitespace in the source carries
        the spacing between words without inserting extra spaces.
        """
        parts = []
        for node in element.children:
            if isinstance(node, str):
                # Collapse multi-whitespace/newlines to a single space but
                # keep surrounding spaces so siblings stay correctly separated.
                normalized = re.sub(r'[ \t\r\n]+', ' ', node)
                if normalized:
                    parts.append(normalized)
            elif hasattr(node, "name"):
                tag = node.name
                inner = self._inline(node)
                if tag in ("b", "strong"):
                    parts.append("<b>{}</b>".format(inner))
                elif tag in ("i", "em"):
                    parts.append("<i>{}</i>".format(inner))
                elif tag == "u":
                    parts.append("<u>{}</u>".format(inner))
                elif tag == "br":
                    parts.append("<br/>")
                elif tag == "s":
                    parts.append(inner)
                elif tag == "span":
                    style = node.get("style", "")
                    if "font-size" in style:
                        m = re.search(r"font-size:\s*([\d.]+)pt", style)
                        if m:
                            parts.append('<font size="{}">{}</font>'.format(m.group(1), inner))
                        else:
                            parts.append(inner)
                    else:
                        parts.append(inner)
                elif inner:
                    parts.append(inner)
        return "".join(parts).strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _load_image_b64(filename: str) -> str:
    """
    Load an image file from the same directory as this module (utils/) and
    return it as a base64-encoded string, or an empty string if not found.
    """
    path = os.path.join(os.path.dirname(__file__), filename)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    return ""


class PDFGenerator:
    """Generate PDFs from the JUPEB admission letter template using ReportLab."""

    @staticmethod
    def _load_template(template_name: str = "admission_letter_template.html") -> str:
        safe_template_name = os.path.basename(template_name)
        template_path = os.path.join(
            os.path.dirname(__file__),
            safe_template_name,
        )
        if os.path.exists(template_path):
            with open(template_path, "r", encoding="utf-8") as f:
                return f.read()
        return "<body><p>No template found</p></body>"

    @staticmethod
    def generate_admission_letter_pdf(body_html: str = "", **kwargs) -> bytes:
        """
        Generate a PDF admission letter.

        Parameters
        ----------
        body_html : str
            Raw HTML string for the letter.  If empty the bundled template is
            loaded from disk.
        **kwargs : dict
            Template context variables, e.g.:
              ref_number     – reference number string
              date           – formatted date string
              candidate_name – recipient's name

            logo_image and sig_image are loaded automatically from
            utils/logo.png and utils/signature.png respectively.
            Any value passed in kwargs will override the auto-loaded one.
        """
        # Auto-load logo and signature from the utils folder if not supplied
        if not kwargs.get("logo_image"):
            kwargs["logo_image"] = _load_image_b64("logo.png")
        if not kwargs.get("sig_image"):
            kwargs["sig_image"] = _load_image_b64("signature.png")

        # Capitalize candidate name
        for key in ["candidate_name", "candidateName"]:
            if key in kwargs and isinstance(kwargs[key], str):
                kwargs[key] = kwargs[key].upper()
        if "candidateName" in kwargs and "candidate_name" not in kwargs:
            kwargs["candidate_name"] = kwargs["candidateName"]
        if "reference" in kwargs and "ref_number" not in kwargs:
            kwargs["ref_number"] = kwargs["reference"]
        
        # Provide programme_upper for the heading, keeping programme in original casing
        prog_val = kwargs.get("programme") or kwargs.get("program") or ""
        if isinstance(prog_val, str):
            kwargs["programme_upper"] = prog_val.upper()
            kwargs["programme"] = prog_val
        else:
            kwargs["programme_upper"] = ""
            kwargs["programme"] = ""

        template_name = kwargs.pop("template_name", "admission_letter_template.html")
        if not body_html.strip():
            body_html = PDFGenerator._load_template(template_name)

        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=1.5 * cm,
            leftMargin=1.5 * cm,
            topMargin=0.8 * cm,
            bottomMargin=0.8 * cm,
        )

        parser = NewTemplateParser()
        try:
            parser.build(body_html, kwargs)
        except Exception as e:
            print(f"[PDFGenerator] Error building flowables: {e}")
            raise

        story = parser.flowables[:]

        doc.build(story)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()
