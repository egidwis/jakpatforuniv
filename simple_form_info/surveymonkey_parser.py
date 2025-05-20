import json
import re
import asyncio
import nest_asyncio
import requests
from bs4 import BeautifulSoup
from pyppeteer import launch
from typing import Dict, Any, Optional
import concurrent.futures

# Apply nest_asyncio to allow nested event loops
nest_asyncio.apply()

class FormNotFoundException(Exception):
    """Exception raised when a form is not found at the provided URL."""
    pass

class AuthRequiredException(Exception):
    """Exception raised when a form requires authentication."""
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

def get_surveymonkey_info(url: str) -> Dict[str, Any]:
    """
    Extracts basic information from a SurveyMonkey form.
    
    Args:
        url: The URL of the SurveyMonkey form.
        
    Returns:
        A dictionary containing the form's title, description, and question count.
        
    Raises:
        FormNotFoundException: If no form is found at the URL.
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
            
            # If we can't find the survey title, use pyppeteer
            if not soup.find('title') or 'SurveyMonkey' not in soup.find('title').text:
                html_content = fetch_with_process_pool(url)
                soup = BeautifulSoup(html_content, 'html.parser')
        except requests.exceptions.RequestException as e:
            raise NetworkException(f"Failed to fetch the form: {str(e)}")
        
        # Check if we found a SurveyMonkey form
        if not soup.find('title') or 'SurveyMonkey' not in soup.find('title').text:
            raise FormNotFoundException("SurveyMonkey form was not found at this URL.")
        
        # Check for authentication requirement
        if soup.find('div', {'class': 'password-required'}) or soup.find('div', {'class': 'login-required'}):
            raise AuthRequiredException("This form requires login or password.")
        
        # Extract form data
        try:
            # Get title
            title_elem = soup.find('h1', {'class': 'survey-title'}) or soup.find('h1')
            title = title_elem.text.strip() if title_elem else "Untitled Survey"
            
            # Get description
            description_elem = soup.find('div', {'class': 'survey-description'}) or soup.find('div', {'class': 'description'})
            description = description_elem.text.strip() if description_elem else ""
            
            # Count questions
            questions = soup.find_all('div', {'class': re.compile('question-container|question-row')})
            question_count = len(questions)
            
            # If no questions found, try alternative selectors
            if question_count == 0:
                questions = soup.find_all('div', {'data-question-type': True})
                question_count = len(questions)
            
            return {
                "title": title,
                "description": description,
                "question_count": question_count,
                "platform": "SurveyMonkey"
            }
        except Exception as e:
            raise NetworkException(f"Failed to parse form data: {str(e)}")
    except Exception as e:
        if isinstance(e, (FormNotFoundException, AuthRequiredException, NetworkException)):
            raise
        raise NetworkException(f"Unexpected error: {str(e)}")
