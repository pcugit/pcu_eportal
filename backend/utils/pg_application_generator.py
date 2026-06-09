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

class PGApplicationPDFGenerator:
    """Generate professional PG Application forms as PDFs using ReportLab."""

    @staticmethod
    def generate_pdf(
        app_data: dict,
        form: dict,
        degree_name: str,
        degree_code: str,
        course_name: str,
        faculty_name: str,
        referees: list,
        evaluation: dict = None,
        signature_b64: str = ""
    ) -> bytes:
        """
        Generate the PDF bytes for a Postgraduate application form.
        """
        pdf_buffer = io.BytesIO()
        
        # A4 margins: 1.5cm left/right, 1.2cm top/bottom to maximize space
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
        
        # ---------------------------------------------------------
        # Styles definition
        # ---------------------------------------------------------
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

        ref_header_style = ParagraphStyle(
            'RefHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.HexColor('#ffffff')
        )
        
        ref_cell_style = ParagraphStyle(
            'RefCell',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=11
        )

        eval_title_style = ParagraphStyle(
            'EvalTitle',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=13,
            alignment=TA_CENTER,
            spaceAfter=2
        )

        eval_subtitle_style = ParagraphStyle(
            'EvalSubtitle',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            spaceAfter=8
        )

        eval_item_style = ParagraphStyle(
            'EvalItem',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9.5,
            leading=14
        )

        # ---------------------------------------------------------
        # Header (Logo & Univ Address)
        # ---------------------------------------------------------
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
        
        # Form Title
        story.append(Paragraph("POSTGRADUATE APPLICATION FORM", form_title_style))
        
        form_no = app_data.get('form_no', 'N/A') or 'N/A'
        session = app_data.get('session', '') or 'N/A'
        story.append(Paragraph(f"Form No: {form_no}  |  Session: {session}", subtitle_style))
        
        # ---------------------------------------------------------
        # (a) BACKGROUND Section
        # ---------------------------------------------------------
        story.append(Paragraph("<b>(a) BACKGROUND</b>", section_heading_style))
        
        # Set up personal info variables
        full_name = ' '.join(filter(None, [form.get('first_name', ''), form.get('middle_name', ''), form.get('surname', '').upper()]))
        dob_raw = form.get('date_of_birth', '')
        dob_str = dob_raw.strftime('%d %B %Y') if hasattr(dob_raw, 'strftime') else str(dob_raw)
        
        gender = form.get('gender', '') or ''
        # Clean gender display: just the word
        if gender.lower() in ('male', 'm'):
            gender_display = 'Male'
        elif gender.lower() in ('female', 'f'):
            gender_display = 'Female'
        else:
            gender_display = gender.capitalize() if gender else 'N/A'

        # Previous Institution & Degree Class
        prev_inst = form.get('previous_institution', '') or 'N/A'
        dept = form.get('department', '') or 'N/A'
        prev_course = form.get('previous_course', '') or 'N/A'
        class_deg = form.get('class_of_degree', '') or 'N/A'

        # Proposed study
        degree_view = f"{degree_name} ({degree_code})" if degree_code else degree_name
        proposed_course = course_name or 'N/A'
        proposed_faculty = faculty_name or 'N/A'
        area_spec = form.get('area_of_specialisation', '') or 'N/A'
        research_title = form.get('proposed_research_title', '') or 'N/A'

        # Mode of study — clean value only
        mode = form.get('mode_of_study', '') or ''
        if 'full' in mode.lower():
            mode_display = 'Full-Time'
        elif 'part' in mode.lower():
            mode_display = 'Part-Time'
        else:
            mode_display = mode.strip() or 'N/A'
            
        # Transcript check
        has_transcript = "Yes" if form.get('document_transcript') else "No"
        
        # Next of Kin / Sponsor
        sponsor_name = form.get('sponsor_name', '') or 'N/A'
        sponsor_addr = form.get('sponsor_address', '') or 'N/A'
        nok_name = form.get('next_of_kin_name', '') or 'N/A'
        nok_addr = form.get('next_of_kin_address', '') or 'N/A'
        nok_phone = form.get('next_of_kin_phone_number', '') or ''
        nok_alt_phone = form.get('secondary_phone_number', '') or ''
        nok_phones_disp = f"{nok_phone} / {nok_alt_phone}" if nok_alt_phone else nok_phone
        if not nok_phones_disp:
            nok_phones_disp = 'N/A'
            
        phys_challenged = form.get('physically_challenged', 'No') or 'No'
        cand_addr = form.get('address', '') or 'N/A'
        cand_email = form.get('email', '') or 'N/A'

        # Construct the items list exactly mirroring the user's form
        items_data = [
            ("1. Full Name (Surname last, in CAPITALS)", full_name),
            ("2. Previous Institution(s) Attended", prev_inst),
            ("3. Date of Birth:", dob_str),
            ("    Sex:", gender_display),  # separate row for Sex
            ("4. Department:", dept),
            ("5. Previous Course of Study", prev_course),
            ("6. Class of First Degree:", class_deg),
            ("6. Proposed Course of Study", proposed_course),
            ("7. Proposed Faculty/Institute/Centre:", proposed_faculty),
            ("8. Degree in View:", degree_view),
            ("9. Area of Specialization:", area_spec),
            ("10. Proposed Title of Research (In the case of MPhil/PhD/PhD):", research_title),
            ("11. Mode of Study:", mode_display),
            ("12. Indicate if you uploaded your academic transcript:", has_transcript)
        ]
        
        # Build Table for Background items
        bg_table_rows = []
        for label, val in items_data:
            lbl_p = Paragraph(label, label_style)
            val_p = Paragraph(val, value_style)
            bg_table_rows.append([lbl_p, val_p])
            
        bg_table = Table(bg_table_rows, colWidths=[8.0 * cm, usable_w - 8.0 * cm])
        bg_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        story.append(bg_table)
        story.append(Spacer(1, 0.2 * cm))
        
        # ---------------------------------------------------------
        # 13. Referees Section
        # ---------------------------------------------------------
        referee_heading = Paragraph("13. Name and Addresses of your 3 referees:", label_style)
        story.append(referee_heading)
        story.append(Spacer(1, 0.1 * cm))
        
        # Referees table
        ref_table_data = [
            [
                Paragraph("<b>#</b>", ref_header_style), 
                Paragraph("<b>Name</b>", ref_header_style), 
                Paragraph("<b>Address</b>", ref_header_style)
            ]
        ]
        
        # Prepare 3 referees
        for idx in range(1, 4):
            rname = form.get(f'referee_name{idx}', '') or ''
            raddr = form.get(f'referee_address{idx}', '') or ''
            letter_code = chr(96 + idx) # a, b, c
            
            ref_table_data.append([
                Paragraph(f"({letter_code})", ref_cell_style),
                Paragraph(rname or 'N/A', ref_cell_style),
                Paragraph(raddr or 'N/A', ref_cell_style)
            ])
            
        ref_table = Table(ref_table_data, colWidths=[1.2 * cm, 5.5 * cm, usable_w - 6.7 * cm])
        ref_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a8a')),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(ref_table)
        story.append(Spacer(1, 0.2 * cm))
        
        # ---------------------------------------------------------
        # Sponsor & Candidate Contact info (Items 14-21)
        # ---------------------------------------------------------
        contact_items = [
            ("14. Name of Sponsor:", sponsor_name),
            ("15. Address of Sponsor:", sponsor_addr),
            ("16. Name of Next of Kin:", nok_name),
            ("17. Address of Next of Kin:", nok_addr),
            ("18. Phone Number of Next of Kin and Alt Phone:", nok_phones_disp),
            ("19. Are you Physically Challenged? If yes. State:", phys_challenged),
            ("20. Address of Candidate", cand_addr),
            ("21. Email of Candidate", cand_email)
        ]
        
        contact_rows = []
        for label, val in contact_items:
            lbl_p = Paragraph(label, label_style)
            val_p = Paragraph(val, value_style)
            contact_rows.append([lbl_p, val_p])
            
        contact_table = Table(contact_rows, colWidths=[8.0 * cm, usable_w - 8.0 * cm])
        contact_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        story.append(contact_table)
        story.append(Spacer(1, 0.2 * cm))

        # ---------------------------------------------------------
        # Item 22: Student's Signature and Date
        # ---------------------------------------------------------
        sig_flowable = None
        if signature_b64:
            try:
                # Strip prefix if present
                if ',' in signature_b64:
                    signature_b64 = signature_b64.split(',')[1]
                img_bytes = base64.b64decode(signature_b64)
                sig_buf = io.BytesIO(img_bytes)
                sig_flowable = Image(sig_buf, width=2.5 * cm, height=0.8 * cm)
                sig_flowable.hAlign = 'LEFT'
            except Exception as e:
                print(f"Error decoding signature image in PDF generator: {e}")
                
        if not sig_flowable:
            sig_flowable = Paragraph("___________________________", value_style)
            
        current_date_str = datetime.now().strftime('%d %B, %Y')
        
        sig_table_data = [
            [
                Paragraph("22. Student's Signature:", label_style),
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
        story.append(Spacer(1, 0.4 * cm))

        # ---------------------------------------------------------
        # SECTION B: EVALUATION AND RECOMMENDATION (Dean)
        # ---------------------------------------------------------
        eval_flowables = []
        eval_flowables.append(Paragraph("SECTION B: EVALUATION AND RECOMMENDATION", eval_title_style))
        eval_flowables.append(Paragraph("(To be completed by the Dean)", eval_subtitle_style))
        
        if evaluation:
            tr_val = evaluation.get('transcript_received', 'No')
            tr_cmt = evaluation.get('transcript_comment', '') or ''
            ref_cnt = evaluation.get('ref_letters_count', 0)
            rec_txt = evaluation.get('recommendation', '') or 'N/A'
            sup_name = evaluation.get('supervisor_name', '') or 'N/A'
            dean_nm = evaluation.get('dean_name', '') or 'N/A'
            eval_dt = (evaluation.get('updated_at') or '')[:10]
            
            # format date beautifully if valid
            try:
                if eval_dt:
                    dt_obj = datetime.strptime(eval_dt, '%Y-%m-%d')
                    eval_dt = dt_obj.strftime('%d %B, %Y')
            except Exception:
                pass
                
            eval_items = [
                f"1. Transcript Received: <b>{tr_val}</b> &nbsp;&nbsp;&nbsp;&nbsp; Comment: <i>{tr_cmt or 'None'}</i>",
                f"2. Number of Reference Letters Received: <b>{ref_cnt}</b>",
                f"3. Recommendation: <b>{rec_txt}</b>",
                f"4. Name of Supervisor: <b>{sup_name}</b>",
                f"5. Dean's Signature and Date: <b>{dean_nm}</b> &nbsp;&nbsp;&nbsp;&nbsp; Date: <b>{eval_dt or 'N/A'}</b>"
            ]
        else:
            eval_items = [
                "1. Transcript Received, Yes/No, Comment: ......................................................................................",
                "2. Number of Reference Letters Received: ......................................................................................",
                "3. Recommendation: .........................................................................................................................",
                "4. Name of Supervisor: .....................................................................................................................",
                "5. Dean's Signature and Date: ............................................................................................................"
            ]
            
        for item in eval_items:
            eval_flowables.append(Paragraph(item, eval_item_style))
            eval_flowables.append(Spacer(1, 0.12 * cm))
            
        eval_box = KeepTogether([
            Spacer(1, 0.2 * cm),
            Table([[eval_flowables]], colWidths=[usable_w], style=[
                ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#0f172a')),
                ('TOPPADDING', (0, 0), (-1, -1), 12),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('LEFTPADDING', (0, 0), (-1, -1), 15),
                ('RIGHTPADDING', (0, 0), (-1, -1), 15),
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc'))
            ])
        ])
        
        story.append(eval_box)

        # Build PDF document
        doc.build(story)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()
