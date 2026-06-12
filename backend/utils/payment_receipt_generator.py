import io
import os
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib import colors


def _int_to_words(n: int) -> str:
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", 
             "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    if n == 0:
        return ""
    elif n < 20:
        return units[n]
    elif n < 100:
        suffix = _int_to_words(n % 10)
        return tens[n // 10] + (" " + suffix if suffix else "")
    elif n < 1000:
        suffix = _int_to_words(n % 100)
        return units[n // 100] + " Hundred" + (" and " + suffix if suffix else "")
    elif n < 1000000:
        suffix = _int_to_words(n % 1000)
        return _int_to_words(n // 1000) + " Thousand" + (", " + suffix if suffix and (n % 1000 < 100) else " " + suffix if suffix else "")
    elif n < 1000000000:
        suffix = _int_to_words(n % 1000000)
        return _int_to_words(n // 1000000) + " Million" + (", " + suffix if suffix else "")
    else:
        suffix = _int_to_words(n % 1000000000)
        return _int_to_words(n // 1000000000) + " Billion" + (", " + suffix if suffix else "")


def number_to_words(amount: float) -> str:
    if amount < 0:
        return "Negative " + number_to_words(-amount)
    
    # Split integer and decimal parts
    n = int(amount)
    cents = int(round((amount - n) * 100))
    
    words_n = _int_to_words(n)
    if not words_n:
        words_n = "Zero"
        
    result = words_n + " Naira"
    
    if cents > 0:
        result += " and " + _int_to_words(cents) + " Kobo"
        
    return result + " Only"


class PaymentReceiptGenerator:
    """Generate payment receipts as PDFs using ReportLab."""

    @staticmethod
    def generate_payment_receipt_pdf(
        receipt_id: str,
        applicant_name: str,
        program_name: str,
        payment_type: str,
        amount: float,
        payment_date: str,
        reference_number: str = "",
        payment_method: str = "Online",
        currency: str = "NGN",
        surname: str = "",
        first_name: str = "",
        middle_name: str = "",
        matric_no: str = "",
        form_no: str = "",
        session: str = "",
        is_pg: bool = False
    ) -> bytes:
        """
        Generate a payment receipt PDF using Precious Cornerstone University branding and styling.
        """
        # Create PDF in memory
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=A4,
            rightMargin=20 * mm,
            leftMargin=20 * mm,
            topMargin=18 * mm,
            bottomMargin=18 * mm
        )
        
        usable_width = A4[0] - 40 * mm
        story = []
        
        # Define styles
        uni_name_style = ParagraphStyle(
            'UniName',
            fontName='Times-Bold',
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=2,
            leading=20
        )
        
        uni_city_style = ParagraphStyle(
            'UniCity',
            fontName='Times-Bold',
            fontSize=13,
            alignment=TA_CENTER,
            spaceAfter=6,
            leading=15
        )
        
        school_name_style = ParagraphStyle(
            'SchoolName',
            fontName='Times-Bold',
            fontSize=14,
            alignment=TA_CENTER,
            spaceAfter=6,
            leading=16
        )
        
        doc_title_style = ParagraphStyle(
            'DocTitle',
            fontName='Times-Bold',
            fontSize=12,
            alignment=TA_CENTER
        )
        
        # ── 1. Header Row ──
        # Load logo.png
        logo_path = os.path.join(os.path.dirname(__file__), 'logo.png')
        if os.path.exists(logo_path):
            logo_img = Image(logo_path, width=72, height=72)
        else:
            logo_img = Paragraph("<b>PCU</b>", ParagraphStyle('LogoFallback', fontName='Times-Bold', fontSize=18, alignment=TA_CENTER))
            
        uni_name_para = Paragraph("PRECIOUS CORNERSTONE UNIVERSITY,", uni_name_style)
        uni_city_para = Paragraph("IBADAN, OYO STATE.", uni_city_style)
        
        header_text_elements = [uni_name_para, uni_city_para]
        if is_pg:
            school_name_para = Paragraph("The Postgraduate School", school_name_style)
            header_text_elements.append(school_name_para)
            
        # Format payment type for title
        payment_type_display = payment_type.replace('_', ' ').title()
        
        doc_title_para = Paragraph(payment_type_display.upper(), doc_title_style)
        doc_title_table = Table([[doc_title_para]], colWidths=[180])
        doc_title_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 18),
            ('RIGHTPADDING', (0, 0), (-1, -1), 18),
        ]))
        doc_title_table.hAlign = 'CENTER'
        header_text_elements.append(doc_title_table)
        
        header_data = [
            [logo_img, "", header_text_elements]
        ]
        
        header_table = Table(header_data, colWidths=[72, 14, usable_width - 86])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (2, 0), (2, 0), 'CENTER'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        
        story.append(header_table)
        
        # Solid border below header (1.2px solid black - thinner)
        header_line = Table([['']], colWidths=[usable_width])
        header_line.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 1.2, colors.black),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_line)
        story.append(Spacer(1, 10))
        
        # ── 2. Ref No & Receipt No Row ──
        ref_left_style = ParagraphStyle(
            'RefLeftStyle',
            fontName='Times-Bold',
            fontSize=11,
            alignment=TA_LEFT
        )
        ref_right_style = ParagraphStyle(
            'RefRightStyle',
            fontName='Times-Bold',
            fontSize=11,
            alignment=TA_RIGHT
        )
        receipt_no_para = Paragraph(f"<b>Receipt No:</b> {receipt_id}", ref_left_style)
        ref_no_para = Paragraph(f"<b>Ref No:</b> {reference_number or 'N/A'}", ref_right_style)
        
        ref_table = Table([[receipt_no_para, ref_no_para]], colWidths=[usable_width/2.0, usable_width/2.0])
        ref_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(ref_table)
        
        ref_line = Table([['']], colWidths=[usable_width])
        ref_line.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor('#ccc')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(ref_line)
        story.append(Spacer(1, 12))
        
        # ── 3. Student Info Grid ──
        # Check rule: for tuition, use matric_no. Otherwise use form_no.
        if payment_type == 'tuition':
            id_label = "Matric Number"
            id_value = matric_no or form_no or "N/A"
        else:
            id_label = "Application No"
            id_value = form_no or "N/A"
            
        # Parse surname and names if surname is empty
        if not surname and applicant_name:
            parts = applicant_name.strip().split()
            if len(parts) > 1:
                surname = parts[-1]
                first_name = ' '.join(parts[:-1])
                middle_name = ""
            else:
                surname = ""
                first_name = applicant_name
                middle_name = ""
                
        info_label_style = ParagraphStyle(
            'InfoLabel',
            fontName='Times-Bold',
            fontSize=12,
            textColor=colors.black
        )
        info_val_style = ParagraphStyle(
            'InfoVal',
            fontName='Times-Roman',
            fontSize=12,
            textColor=colors.black
        )
        
        col_widths = [110, 10, 150, 10, 60, 10, usable_width - 350]
        
        # Format surname as uppercase, other names in Title/Sentence case
        surname_formatted = (surname or "N/A").strip().upper()
        
        name_val = first_name
        if middle_name:
            name_val += " " + middle_name
        if not name_val:
            name_val = applicant_name
            
        name_val_formatted = " ".join(word.capitalize() for word in (name_val or "N/A").strip().split())
            
        info_data = [
            [
                Paragraph(id_label, info_label_style),
                Paragraph(":", info_val_style),
                Paragraph(id_value, info_val_style),
                "",
                Paragraph("Session", info_label_style),
                Paragraph(":", info_val_style),
                Paragraph(session or "N/A", info_val_style)
            ],
            [
                Paragraph("Surname", info_label_style),
                Paragraph(":", info_val_style),
                Paragraph(surname_formatted, info_val_style),
                "",
                Paragraph("Name", info_label_style),
                Paragraph(":", info_val_style),
                Paragraph(name_val_formatted, info_val_style)
            ]
        ]
        
        info_table = Table(info_data, colWidths=col_widths)
        info_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        story.append(info_table)
        story.append(Spacer(1, 16))
        
        # ── 4. Fee Table ──
        fee_header_style = ParagraphStyle(
            'FeeHeader',
            fontName='Times-Bold',
            fontSize=12,
            textColor=colors.black
        )
        fee_header_amt_style = ParagraphStyle(
            'FeeHeaderAmt',
            parent=fee_header_style,
            alignment=TA_RIGHT
        )
        fee_body_style = ParagraphStyle(
            'FeeBody',
            fontName='Times-Roman',
            fontSize=12,
            textColor=colors.black
        )
        fee_body_center_style = ParagraphStyle(
            'FeeBodyCenter',
            parent=fee_body_style,
            alignment=TA_CENTER
        )
        fee_body_amt_style = ParagraphStyle(
            'FeeBodyAmt',
            parent=fee_body_style,
            alignment=TA_RIGHT
        )
        
        fee_data = [
            [
                Paragraph("S/N", fee_body_center_style),
                Paragraph("Description", fee_header_style),
                Paragraph("Amount (NGN)", fee_header_amt_style)
            ]
        ]
        
        if payment_type == 'acceptance_fee':
            description = 'Admission Acceptance Fee'
        elif payment_type == 'tuition':
            description = 'Tuition Fee Payment'
        elif payment_type == 'application_fee':
            description = 'Application Form Fee'
        else:
            description = payment_type_display
            
        fee_data.append([
            Paragraph("1", fee_body_center_style),
            Paragraph(description, fee_body_style),
            Paragraph(f"{amount:,.2f}", fee_body_amt_style)
        ])
        
        fee_data.append([
            "",
            Paragraph("Total", fee_header_style),
            Paragraph(f"{amount:,.2f}", fee_header_amt_style)
        ])
        
        fee_table = Table(fee_data, colWidths=[40, usable_width - 200, 160])
        fee_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f2f2f2')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('BOX', (0, 0), (-1, 0), 0.75, colors.black),
            ('INNERGRID', (0, 0), (-1, 0), 0.75, colors.black),
            ('BOX', (0, 1), (-1, 1), 0.75, colors.black),
            ('INNERGRID', (0, 1), (-1, 1), 0.75, colors.black),
            ('LINEABOVE', (1, -1), (-1, -1), 1.2, colors.black),
            ('BOX', (1, -1), (-1, -1), 0.75, colors.black),
            ('INNERGRID', (1, -1), (-1, -1), 0.75, colors.black),
        ]))
        
        story.append(fee_table)
        story.append(Spacer(1, 16))
        
        # ── 5. Amount in Words Box ──
        words_lbl_style = ParagraphStyle(
            'WordsLbl',
            fontName='Times-Bold',
            fontSize=12,
            textColor=colors.black,
            spaceAfter=4
        )
        words_val_style = ParagraphStyle(
            'WordsVal',
            fontName='Times-Italic',
            fontSize=12,
            textColor=colors.black
        )
        
        words_text = number_to_words(amount)
        words_content = [
            Paragraph("Amount in Words:", words_lbl_style),
            Paragraph(words_text, words_val_style)
        ]
        
        words_table = Table([[words_content]], colWidths=[usable_width])
        words_table.setStyle(TableStyle([
            ('BOX', (0, 0), (-1, -1), 0.75, colors.black),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        
        story.append(words_table)
        story.append(Spacer(1, 24))
        
        # ── 6. Accountant Signature & Date Section ──
        sig_lbl_style = ParagraphStyle(
            'SigLbl',
            fontName='Times-Bold',
            fontSize=11,
            textColor=colors.black,
            spaceAfter=36
        )
        sig_line_style = ParagraphStyle(
            'SigLine',
            fontName='Times-Roman',
            fontSize=11,
            textColor=colors.HexColor('#555')
        )
        
        sig_inner_data = [
            [Paragraph("ACCOUNTANT'S SIGNATURE", sig_lbl_style)],
            [Spacer(1, 36)],
            [Paragraph("Signature & Stamp", sig_line_style)]
        ]
        sig_inner_table = Table(sig_inner_data, colWidths=[200])
        sig_inner_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 2), (0, 2), 0.75, colors.black),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        date_inner_data = [
            [Paragraph("DATE", sig_lbl_style)],
            [Spacer(1, 36)],
            [Paragraph("&nbsp;", sig_line_style)]
        ]
        date_inner_table = Table(date_inner_data, colWidths=[200])
        date_inner_table.setStyle(TableStyle([
            ('LINEABOVE', (0, 2), (0, 2), 0.75, colors.black),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        
        sig_layout = Table([[sig_inner_table, "", date_inner_table]], colWidths=[200, usable_width - 400, 200])
        sig_layout.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        
        story.append(sig_layout)
        
        # Build document
        doc.build(story)
        pdf_buffer.seek(0)
        return pdf_buffer.getvalue()

