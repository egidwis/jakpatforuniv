#!/usr/bin/env python3
"""
Simple script to test the form_parser functionality directly.
This script allows you to get information from a Google Form without using the web interface.

Usage:
    python test_form_parser.py <google_form_url>

Example:
    python test_form_parser.py https://docs.google.com/forms/d/e/1FAIpQLSdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/viewform
"""

import sys
from form_parser import get_form_info, FormNotFoundException, AuthRequiredException

def main():
    # Check if URL was provided as command line argument
    if len(sys.argv) < 2:
        print("Error: Please provide a Google Form URL")
        print("Usage: python test_form_parser.py <google_form_url>")
        sys.exit(1)
    
    # Get the URL from command line arguments
    url = sys.argv[1]
    
    print(f"Fetching information from: {url}")
    print("This may take a few seconds...")
    
    try:
        # Get form information
        form_info = get_form_info(url)
        
        # Print the results
        print("\n=== Google Form Information ===")
        print(f"Title: {form_info['title']}")
        print(f"Description: {form_info['description']}")
        print(f"Total Questions: {form_info['question_count']}")
        print("==============================")
        
    except FormNotFoundException as e:
        print(f"Error: Form not found - {str(e)}")
    except AuthRequiredException as e:
        print(f"Error: Authentication required - {str(e)}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()
