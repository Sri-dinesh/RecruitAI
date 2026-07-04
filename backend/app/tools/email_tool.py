import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from langchain_core.tools import tool
from app.core.llm_router import call_llm
from app.core.config import SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_SENDER


@tool
def draft_recruiter_email(candidate_name: str, role: str, action: str) -> str:
    """
    Draft a recruiter email for a candidate.

    Args:
        candidate_name: Full name of the candidate.
        role: The job role being applied for.
        action: The action type - one of 'interview invite', 'rejection', 'offer'.

    Returns:
        A formatted email draft string.
    """
    system_instruction = (
        "You are a professional technical recruiter writing concise, warm, and professional emails. "
        "Draft a recruiter email for the given candidate and action. "
        "Include: Subject line, greeting, body, and professional sign-off. "
        "Keep it under 200 words. Be specific to the action type."
    )
    prompt = (
        f"Write a '{action}' email for candidate **{candidate_name}** "
        f"who applied for the **{role}** role.\n\n"
        "Return the full email text including Subject, Body, and Signature."
    )

    try:
        response_text, provider, _ = call_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=False
        )
        return response_text.strip()
    except Exception as e:
        # Fallback template
        action_line = {
            "interview invite": f"We'd like to invite you for an interview for the {role} position.",
            "rejection": f"After careful consideration, we regret to inform you that we will not be moving forward with your application for the {role} role.",
            "offer": f"We are delighted to extend an offer for the {role} position."
        }.get(action.lower(), f"We are reaching out regarding your application for the {role} role.")

        return (
            f"Subject: {action.title()} - {role} Position\n\n"
            f"Dear {candidate_name},\n\n"
            f"{action_line}\n\n"
            f"Please feel free to reach out if you have any questions.\n\n"
            f"Best regards,\n"
            f"The Recruiting Team\n\n"
            f"[Note: Draft generated using template fallback due to: {e}]"
        )


@tool
def send_email_draft(email_draft: str, recipient_email: str = "candidate@example.com") -> str:
    """
    Send an email draft using SMTP. If SMTP username and password are not configured,
    falls back to logging/simulating the send to stdout.

    Args:
        email_draft: The full email text to send.
        recipient_email: The recipient's email address.

    Returns:
        A confirmation message string detailing success or fallback status.
    """
    if SMTP_USERNAME and SMTP_PASSWORD:
        try:
            # Parse subject and body from the email draft
            subject = "RecruitAI Outreach"
            body = email_draft

            lines = email_draft.split("\n")
            # Look for "Subject: ..." or "subject: ..."
            subject_line = next((l for l in lines if l.lower().startswith("subject:")), None)
            if subject_line:
                subject = subject_line[len("subject:"):].strip()
                # Exclude subject line from body
                body = "\n".join([l for l in lines if not l.lower().startswith("subject:")])
                body = body.strip()

            # Construct MIME message
            msg = MIMEMultipart()
            msg['From'] = SMTP_SENDER or SMTP_USERNAME
            msg['To'] = recipient_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            # Dispatch email
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.sendmail(SMTP_SENDER or SMTP_USERNAME, recipient_email, msg.as_string())

            return (
                f"✅ **Email sent successfully via SMTP!**\n"
                f"Recipient: `{recipient_email}`\n"
                f"Subject: `{subject}`\n"
                f"Server: `{SMTP_SERVER}:{SMTP_PORT}`"
            )
        except Exception as e:
            return (
                f"❌ **Failed to send email via SMTP:** {str(e)}\n"
                f"Recipient: `{recipient_email}`"
            )

    # SMTP fallback log stub: log to stdout
    separator = "=" * 60
    print(f"\n{separator}", file=sys.stdout)
    print(f"[EMAIL STUB] Sending to: {recipient_email}", file=sys.stdout)
    print(separator, file=sys.stdout)
    print(email_draft, file=sys.stdout)
    print(separator, file=sys.stdout)

    return (
        f"⚠️ **SMTP credentials not set in .env. Logged to console instead.**\n"
        f"Recipient: `{recipient_email}`\n"
        f"Status: Logged successfully (SMTP simulation mode)."
    )
