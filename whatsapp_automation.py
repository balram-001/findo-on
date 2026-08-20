"""
Automated WhatsApp messaging script using Web WhatsApp.
"""
import asyncio
import json
import sys
from urllib.parse import quote
from playwright.async_api import async_playwright

async def send_whatsapp_messages(leads: list[dict], message_template: str):
    async with async_playwright() as playwright:
        # Browser open using local user directory to persist WhatsApp session QR login
        user_data_dir = "./chrome_user_data"
        context = await playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            headless=False,
            args=["--no-sandbox"]
        )
        page = context.pages[0] if context.pages else await context.new_page()

        await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")
        print("Please scan QR code if not already logged in...")

        for lead in leads:
            phone = lead.get("phone")
            company = lead.get("companyName", "Business Owner")
            if not phone:
                continue

            custom_msg = message_template.replace("{name}", company)
            encoded_msg = quote(custom_msg)
            wa_url = f"https://web.whatsapp.com/send?phone={phone}&text={encoded_msg}"

            try:
                await page.goto(wa_url, wait_until="domcontentloaded")
                await page.wait_for_selector('button[aria-label="Send"], span[data-icon="send"]', timeout=25_000)
                send_btn = page.locator('button[aria-label="Send"], span[data-icon="send"]').first
                await send_btn.click()
                await asyncio.sleep(3)
            except Exception as e:
                print(f"Failed to send to {phone}: {str(e)}")

        await context.close()

if __name__ == "__main__":
    try:
        if len(sys.argv) > 1:
            data = json.loads(sys.argv[1])
            leads = data.get("leads", [])
            msg = data.get("message", "Hello {name}, interested in scaling your business?")
            asyncio.run(send_whatsapp_messages(leads, msg))
    except Exception as err:
        print(f"Error: {err}")