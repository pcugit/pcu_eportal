import os
import io
import base64
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib import colors

class PTApplicationPDFGenerator:
    """Generate professional PT / HND-Conversion Application forms as PDFs using ReportLab."""

    @staticmethod
    def generate_pdf(
        app_data: dict,
        form: dict,
        degree_name: str,
        degree_code: str,
        course_name: str,
        faculty_name: str,
        signature_b64: str = "",
        olevel_results: list = None
    ) -> bytes:
        if olevel_results is None:
            olevel_results = []

        pdf_buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            leftMargin=1.5 * cm,
            rightMargin=1.5 * cm,
            topMargin=1.2 * cm,
            bottomMargin=1.2 * cm
        )

        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'UnivTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=13,
            leading=16,
            alignment=TA_CENTER,
            spaceAfter=2
        )

        address_style = ParagraphStyle(
            'UnivAddress',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            alignment=TA_CENTER,
            spaceAfter=8
        )

        form_title_style = ParagraphStyle(
            'FormTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=14,
            alignment=TA_CENTER,
            spaceAfter=2
        )

        subtitle_style = ParagraphStyle(
            'FormSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            spaceAfter=15
        )

        section_heading_style = ParagraphStyle(
            'SectionHeading',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10.5,
            leading=13,
            textColor=colors.HexColor('#000000'),
            spaceBefore=12,
            spaceAfter=6
        )

        label_style = ParagraphStyle(
            'LabelStyle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor('#111111')
        )

        value_style = ParagraphStyle(
            'ValueStyle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9.5,
            leading=12,
            textColor=colors.HexColor('#0f172a')
        )

        small_label_style = ParagraphStyle(
            'SmallLabel',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#374151')
        )

        small_value_style = ParagraphStyle(
            'SmallValue',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor('#0f172a')
        )

        # ── Header (Logo & Univ Address) ──────────────────────────────────────────
        logo_path = os.path.join(os.path.dirname(__file__), 'logo.png')
        logo_img = None
        if os.path.exists(logo_path):
            try:
                logo_img = Image(logo_path, width=1.6 * cm, height=1.6 * cm)
            except Exception as e:
                print(f"Error loading header logo: {e}")

        title_text = "PRECIOUS CORNERSTONE UNIVERSITY"
        address_text = (
            "Garden of Victory, Olaogun Street, Old Ife Road,<br/>"
            "P.M.B. 60, Agodi Post Office, Ibadan, Oyo State.<br/>"
            "A Tertiary Institution of The Sword of The Spirit Ministries"
        )

        title_para = Paragraph(title_text, title_style)
        address_para = Paragraph(address_text, address_style)

        usable_w = A4[0] - 3.0 * cm
        if logo_img:
            logo_w = 1.8 * cm
            text_w = usable_w - logo_w
            header_table = Table([[logo_img, [title_para, address_para]]], colWidths=[logo_w, text_w])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('TOPPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(header_table)
        else:
            story.append(title_para)
            story.append(address_para)

        story.append(Spacer(1, 0.1 * cm))

        # ── Form Title ────────────────────────────────────────────────────────────
        prog_type = str(app_data.get('prog_type') or app_data.get('program_id') or '')
        form_title = "HND CONVERSION APPLICATION FORM" if prog_type == '4' else "PART-TIME APPLICATION FORM"
        story.append(Paragraph(form_title, form_title_style))

        form_no = app_data.get('form_no', 'N/A') or 'N/A'
        session = app_data.get('session', '') or 'N/A'
        story.append(Paragraph(f"Form No: {form_no}  |  Session: {session}", subtitle_style))

        # ── Helper: build a two-column data table ─────────────────────────────────
        def _field_table(data_pairs, col1_width=6.0):
            rows = []
            for label, val in data_pairs:
                lbl_p = Paragraph(label, label_style)
                val_p = Paragraph(str(val) if val else 'N/A', value_style)
                rows.append([lbl_p, val_p])
            tbl = Table(rows, colWidths=[col1_width * cm, usable_w - col1_width * cm])
            tbl.setStyle(TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ]))
            return tbl

        # ── SECTION 1: Personal Details ───────────────────────────────────────────
        story.append(Paragraph("<b>PERSONAL DETAILS</b>", section_heading_style))

        full_name = form.get('full_name', '') or ' '.join(
            filter(None, [
                form.get('first_name', ''),
                form.get('middle_name', ''),
                (form.get('surname', '') or '').upper()
            ])
        )
        dob_str  = form.get('date_of_birth', 'N/A') or 'N/A'
        gender   = (form.get('gender', 'N/A') or 'N/A').capitalize()
        marital  = (form.get('marital_status', 'N/A') or 'N/A').capitalize()
        state    = form.get('state_of_origin', form.get('state', 'N/A')) or 'N/A'
        address  = form.get('address', 'N/A') or 'N/A'
        phone    = form.get('phone_number', 'N/A') or 'N/A'
        sec_phone = form.get('secondary_phone', form.get('secondary_phone_number', '')) or ''
        email    = form.get('email', 'N/A') or 'N/A'
        place_of_birth = form.get('place_of_birth', '') or ''
        religion = form.get('religion', '') or ''
        blood_group = form.get('blood_group', '') or ''
        genotype = form.get('genotype', '') or ''
        lga = form.get('lga', form.get('local_govt_area', '')) or ''
        who_referred = form.get('who_referred_you', form.get('who_referred', '')) or ''
        contact_address = form.get('contact_address', '') or ''

        personal_data = [
            ("Full Name", full_name),
            ("Date of Birth", dob_str),
            ("Place of Birth", place_of_birth or 'N/A'),
            ("Gender", gender),
            ("Religion", religion or 'N/A'),
            ("Blood Group", blood_group or 'N/A'),
            ("Genotype", genotype or 'N/A'),
            ("Marital Status", marital),
            ("State of Origin", state),
            ("L.G.A.", lga or 'N/A'),
            ("Contact Address", contact_address or address),
            ("Phone Number", phone),
        ]
        if sec_phone:
            personal_data.append(("Secondary Phone", sec_phone))
        personal_data.append(("Email Address", email))
        if who_referred:
            personal_data.append(("Who Referred You", who_referred))

        story.append(_field_table(personal_data))
        story.append(Spacer(1, 0.3 * cm))

        # ── SECTION 2: Proposed Programme ─────────────────────────────────────────
        story.append(Paragraph("<b>PROPOSED PROGRAMME OF STUDY</b>", section_heading_style))
        degree_view = f"{degree_name} ({degree_code})" if degree_code else (degree_name or 'N/A')
        prog_data = [
            ("Faculty", faculty_name or 'N/A'),
            ("Degree in View", degree_view),
            ("Proposed Course", course_name or 'N/A'),
            ("Mode of Study", form.get('mode_of_study', 'Part-Time') or 'Part-Time'),
        ]
        story.append(_field_table(prog_data))
        story.append(Spacer(1, 0.3 * cm))

        # ── SECTION 4: O'Level Results ────────────────────────────────────────────
        if olevel_results:
            story.append(Paragraph("<b>O'LEVEL RESULTS</b>", section_heading_style))
            sitting_labels = ["First Sitting", "Second Sitting"]
            for idx, sitting in enumerate(olevel_results):
                label = sitting_labels[idx] if idx < len(sitting_labels) else f"Sitting {idx + 1}"
                exam_type   = sitting.get('exam_type') or 'N/A'
                exam_no     = sitting.get('exam_no') or 'N/A'
                exam_year   = sitting.get('exam_year') or 'N/A'
                exam_period = sitting.get('exam_period') or 'N/A'
                subjects    = sitting.get('subjects') or []

                # Sitting info row
                sitting_info_data = [
                    [
                        Paragraph(f"<b>{label}</b>", small_label_style),
                        Paragraph(f"Exam Type: <b>{exam_type}</b>", small_label_style),
                        Paragraph(f"Exam No: <b>{exam_no}</b>", small_label_style),
                        Paragraph(f"Year: <b>{exam_year}</b>", small_label_style),
                        Paragraph(f"Period: <b>{exam_period}</b>", small_label_style),
                    ]
                ]
                info_col_widths = [
                    usable_w * 0.18,
                    usable_w * 0.22,
                    usable_w * 0.25,
                    usable_w * 0.15,
                    usable_w * 0.20,
                ]
                info_tbl = Table(sitting_info_data, colWidths=info_col_widths)
                info_tbl.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 4),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f1f5f9')),
                    ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ]))
                story.append(info_tbl)

                if subjects:
                    # Table header
                    subj_header = [
                        Paragraph("<b>Subject</b>", small_label_style),
                        Paragraph("<b>Grade</b>", small_label_style),
                    ]
                    subj_rows = [subj_header]
                    for s in subjects:
                        subj_rows.append([
                            Paragraph(s.get('subject', ''), small_value_style),
                            Paragraph(s.get('grade', ''), small_value_style),
                        ])
                    col_w1 = usable_w * 0.70
                    col_w2 = usable_w * 0.30
                    subj_tbl = Table(subj_rows, colWidths=[col_w1, col_w2])
                    subj_tbl.setStyle(TableStyle([
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('LEFTPADDING', (0, 0), (-1, -1), 4),
                        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
                        ('TOPPADDING', (0, 0), (-1, -1), 3),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#e2e8f0')),
                        ('LINEBELOW', (0, 0), (-1, 0), 1.0, colors.HexColor('#94a3b8')),
                    ]))
                    story.append(subj_tbl)

                story.append(Spacer(1, 0.25 * cm))

        # ── SECTION 5: Sponsor Details ────────────────────────────────────────────
        story.append(Paragraph("<b>SPONSOR DETAILS</b>", section_heading_style))
        sponsor_data = [
            ("Sponsor Name", form.get('sponsor_name', 'N/A') or 'N/A'),
            ("Relationship", form.get('sponsor_relationship', 'N/A') or 'N/A'),
            ("Sponsor Address", form.get('sponsor_address', 'N/A') or 'N/A'),
            ("Sponsor Phone", form.get('sponsor_phone_number', 'N/A') or 'N/A'),
            ("Sponsor Email", form.get('sponsor_email', 'N/A') or 'N/A'),
        ]
        story.append(_field_table(sponsor_data))
        story.append(Spacer(1, 0.3 * cm))

        # ── SECTION 6: Next of Kin ────────────────────────────────────────────────
        story.append(Paragraph("<b>NEXT OF KIN</b>", section_heading_style))
        nok_data = [
            ("Full Name", form.get('next_of_kin_name', 'N/A') or 'N/A'),
            ("Address", form.get('next_of_kin_address', 'N/A') or 'N/A'),
            ("Phone Number", form.get('next_of_kin_phone_number', 'N/A') or 'N/A'),
        ]
        story.append(_field_table(nok_data))
        story.append(Spacer(1, 0.4 * cm))

        # ── Signature ─────────────────────────────────────────────────────────────
        sig_flowable = None
        if signature_b64:
            try:
                if ',' in signature_b64:
                    signature_b64 = signature_b64.split(',')[1]
                img_bytes = base64.b64decode(signature_b64)
                sig_buf = io.BytesIO(img_bytes)
                sig_flowable = Image(sig_buf, width=2.5 * cm, height=0.8 * cm)
                sig_flowable.hAlign = 'LEFT'
            except Exception as e:
                print(f"Error decoding signature image: {e}")

        if not sig_flowable:
            sig_flowable = Paragraph("___________________________", value_style)

        current_date_str = datetime.now().strftime('%d %B, %Y')

        sig_table_data = [
            [
                Paragraph("Student's Signature:", label_style),
                sig_flowable,
                Paragraph(f"Date: <b>{current_date_str}</b>", label_style)
            ]
        ]

        sig_table = Table(sig_table_data, colWidths=[4.5 * cm, 6.0 * cm, usable_w - 10.5 * cm])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(sig_table)

        doc.build(story)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()
