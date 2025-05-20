import json
import re
import asyncio
import nest_asyncio
import requests
from bs4 import BeautifulSoup
from pyppeteer import launch
from typing import Dict, Any, Optional
import multiprocessing
import concurrent.futures

# Apply nest_asyncio to allow nested event loops
nest_asyncio.apply()

class FormNotFoundException(Exception):
    """Exception raised when a Google Form is not found at the provided URL."""
    pass

class AuthRequiredException(Exception):
    """Exception raised when a Google Form requires authentication."""
    pass

class NetworkException(Exception):
    """Exception raised when there are network issues fetching the form."""
    pass

# Browser headers to mimic a real browser
BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

async def _fetch_with_pyppeteer(url: str) -> str:
    """
    Fetch a URL using pyppeteer (headless Chrome).

    Args:
        url: The URL to fetch.

    Returns:
        The page HTML content.
    """
    browser = None
    try:
        browser = await launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        )
        page = await browser.newPage()

        # Set user agent and other headers
        await page.setUserAgent(BROWSER_HEADERS['User-Agent'])
        await page.setExtraHTTPHeaders({k: v for k, v in BROWSER_HEADERS.items() if k != 'User-Agent'})

        # Navigate to the URL with a timeout
        await page.goto(url, {'timeout': 60000, 'waitUntil': 'networkidle0'})

        # Wait a bit for any JavaScript to execute
        await asyncio.sleep(3)

        # Get the page content
        content = await page.content()
        return content
    finally:
        if browser:
            await browser.close()

def fetch_with_pyppeteer_sync(url: str) -> str:
    """
    Synchronous wrapper around _fetch_with_pyppeteer.

    Args:
        url: The URL to fetch.

    Returns:
        The page HTML content.
    """
    # Create a new event loop for this thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(_fetch_with_pyppeteer(url))
    finally:
        loop.close()

def fetch_with_process_pool(url: str) -> str:
    """
    Fetch a URL using a separate process to avoid threading issues.

    Args:
        url: The URL to fetch.

    Returns:
        The page HTML content.
    """
    with concurrent.futures.ProcessPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fetch_with_pyppeteer_sync, url)
        return future.result()

def parse_form_definition_script(text: str) -> dict:
    """
    Parses the JavaScript containing the form definition.

    Args:
        text: The script element text containing the form definition.

    Returns:
        The parsed form definition as a dictionary.
    """
    start = "var FB_PUBLIC_LOAD_DATA_ = "

    try:
        if start not in text:
            raise ValueError("Form data marker not found in script")

        index1 = text.index(start) + len(start)
        # Find the end of the JSON data (usually ends with ';')
        index2 = text.rfind(';')
        if index2 == -1:  # If no semicolon, try to use the whole text
            index2 = len(text)

        json_str = text[index1:index2].strip()
        return json.loads(json_str)
    except (ValueError, json.JSONDecodeError) as e:
        raise NetworkException(f"Failed to parse form data: {str(e)}")

def get_form_info(url: str) -> Dict[str, Any]:
    """
    Extracts basic information from a form (Google Form, SurveyMonkey, etc.).

    Args:
        url: The URL of the form.

    Returns:
        A dictionary containing the form's title, description, and question count.

    Raises:
        FormNotFoundException: If no form is found at the URL.
        AuthRequiredException: If the form requires authentication.
        NetworkException: If there are network issues fetching the form.
    """
    # Import SurveyMonkey parser
    from surveymonkey_parser import get_surveymonkey_info

    # Detect form type based on URL
    if 'docs.google.com/forms' in url:
        return get_google_form_info(url)
    elif 'surveymonkey.com' in url:
        return get_surveymonkey_info(url)
    else:
        # Try to detect form type from content
        try:
            response = requests.get(url, headers=BROWSER_HEADERS, timeout=30)
            response.raise_for_status()
            html_content = response.text

            # Check form type from content
            if 'docs.google.com/forms' in html_content or 'FB_PUBLIC_LOAD_DATA_' in html_content:
                return get_google_form_info(url)
            elif 'surveymonkey.com' in html_content or 'SurveyMonkey' in html_content:
                return get_surveymonkey_info(url)
            else:
                # Default to Google Forms parser
                return get_google_form_info(url)
        except requests.exceptions.RequestException as e:
            raise NetworkException(f"Failed to fetch the form: {str(e)}")

def get_google_form_info(url: str) -> Dict[str, Any]:
    """
    Extracts basic information from a Google Form.

    Args:
        url: The URL of the Google Form.

    Returns:
        A dictionary containing the form's title, description, and question count.

    Raises:
        FormNotFoundException: If no Google Form is found at the URL.
        AuthRequiredException: If the form requires authentication.
        NetworkException: If there are network issues fetching the form.
    """
    try:
        # First try with regular requests
        try:
            response = requests.get(url, headers=BROWSER_HEADERS, timeout=30)
            response.raise_for_status()
            html_content = response.text

            # Check if we need JavaScript rendering
            soup = BeautifulSoup(html_content, 'html.parser')
            form_data_script = soup.find('script', text=re.compile('FB_PUBLIC_LOAD_DATA_'))

            # If we can't find the form data with regular requests, use pyppeteer
            if not form_data_script:
                html_content = fetch_with_process_pool(url)
                soup = BeautifulSoup(html_content, 'html.parser')
                form_data_script = soup.find('script', text=re.compile('FB_PUBLIC_LOAD_DATA_'))
        except requests.exceptions.RequestException as e:
            raise NetworkException(f"Failed to fetch the form: {str(e)}")

        # Check if we found a form
        if not soup.find('form'):
            raise FormNotFoundException("Google Form was not found at this URL.")

        # Check for authentication requirement
        if soup.find('form', action=re.compile('accounts.google.com')):
            raise AuthRequiredException("This form requires login.")

        # Extract form data from JavaScript
        if not form_data_script:
            raise FormNotFoundException("Google Form data could not be extracted.")

        # Parse the form definition
        try:
            form_definition = parse_form_definition_script(form_data_script.string)

            # Extract basic information
            title = form_definition[1][8]
            description = form_definition[1][0]

            # Count questions (excluding page breaks)
            questions_data = form_definition[1][1]
            question_count = 0
            for question_data in questions_data:
                # Type 8 is a page break
                if question_data[3] != 8:
                    question_count += 1

            # Get submit URL
            form_element = soup.find('form')
            submit_url = form_element.get('action', '') if form_element else ''

            return {
                "title": title,
                "description": description,
                "question_count": question_count,
                "submit_url": submit_url,
                "platform": "Google Forms"
            }
        except Exception as e:
            raise NetworkException(f"Failed to parse form data: {str(e)}")
    except Exception as e:
        if isinstance(e, (FormNotFoundException, AuthRequiredException, NetworkException)):
            raise
        raise NetworkException(f"Unexpected error: {str(e)}")

def parse_form_definition_script(text: str) -> dict:
    """
    Parses the JavaScript containing the form definition.

    Args:
        text: The script element text containing the form definition.

    Returns:
        The parsed form definition as a dictionary.
    """
    start = "var FB_PUBLIC_LOAD_DATA_ = "

    try:
        if start not in text:
            raise ValueError("Form data marker not found in script")

        index1 = text.index(start) + len(start)
        # Find the end of the JSON data (usually ends with ';')
        index2 = text.rfind(';')
        if index2 == -1:  # If no semicolon, try to use the whole text
            index2 = len(text)

        json_str = text[index1:index2].strip()
        return json.loads(json_str)
    except (ValueError, json.JSONDecodeError) as e:
        raise NetworkException(f"Failed to parse form data: {str(e)}")
