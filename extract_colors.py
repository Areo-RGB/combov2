#!/usr/bin/env python3
"""
Extract color-related CSS from animate-ui.com using Playwright
"""

from playwright.sync_api import sync_playwright
import re
import json

def extract_colors_from_page(page):
    """Extract all color-related information from the page"""

    # Get all computed styles
    colors_info = {}

    # Extract CSS custom properties (variables)
    css_vars = page.evaluate("""
        () => {
            const vars = {};
            const computedStyle = getComputedStyle(document.documentElement);
            for (let i = 0; i < computedStyle.length; i++) {
                const prop = computedStyle[i];
                if (prop.startsWith('--') && (prop.includes('color') || prop.includes('theme') || prop.includes('hue'))) {
                    vars[prop] = computedStyle.getPropertyValue(prop).trim();
                }
            }
            return vars;
        }
    """)

    colors_info['css_variables'] = css_vars

    # Extract all stylesheets content
    stylesheets = page.evaluate("""
        () => {
            const sheets = [];
            for (let sheet of document.styleSheets) {
                try {
                    const rules = [];
                    for (let rule of sheet.cssRules) {
                        rules.push(rule.cssText);
                    }
                    sheets.push({
                        href: sheet.href,
                        rules: rules
                    });
                } catch (e) {
                    sheets.push({
                        href: sheet.href,
                        error: str(e)
                    });
                }
            }
            return sheets;
        }
    """)

    # Filter color-related rules
    color_rules = []
    color_keywords = ['color', 'background', 'border', 'rgb', 'hsl', 'hsv', '#', 'var(--']

    for sheet in stylesheets:
        if 'rules' in sheet:
            for rule in sheet['rules']:
                if any(keyword in rule.lower() for keyword in color_keywords):
                    color_rules.append({
                        'source': sheet.get('href', 'inline'),
                        'rule': rule
                    })

    colors_info['color_rules'] = color_rules

    # Get element colors from important UI elements
    element_colors = page.evaluate("""
        () => {
            const elements = [];
            const selectors = ['button', 'a', '.btn', '[class*="color"]', '[class*="theme"]', 'body', 'html'];

            for (let selector of selectors) {
                try {
                    const elems = document.querySelectorAll(selector);
                    for (let el of elems.slice(0, 5)) { // Limit to first 5 elements per selector
                        const computed = getComputedStyle(el);
                        elements.push({
                            selector: selector,
                            tagName: el.tagName,
                            className: el.className,
                            color: computed.color,
                            backgroundColor: computed.backgroundColor,
                            borderColor: computed.borderColor,
                            text: el.textContent?.slice(0, 50) || ''
                        });
                    }
                } catch (e) {
                    // Ignore selector errors
                }
            }
            return elements;
        }
    """)

    colors_info['element_colors'] = element_colors

    return colors_info

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            print("Navigating to animate-ui.com...")
            page.goto('https://animate-ui.com/', wait_until='networkidle')

            print("Extracting color information...")
            colors_info = extract_colors_from_page(page)

            # Save to JSON file
            with open('animate_ui_colors.json', 'w') as f:
                json.dump(colors_info, f, indent=2)

            # Print summary
            print(f"\nExtraction complete!")
            print(f"Found {len(colors_info['css_variables'])} CSS variables")
            print(f"Found {len(colors_info['color_rules'])} color-related CSS rules")
            print(f"Found {len(colors_info['element_colors'])} element color samples")

            # Print CSS variables
            if colors_info['css_variables']:
                print(f"\nCSS Variables:")
                for var, value in colors_info['css_variables'].items():
                    print(f"  {var}: {value}")

            # Print key color rules
            print(f"\nKey Color Rules:")
            for rule in colors_info['color_rules'][:10]:  # Show first 10
                print(f"  {rule['rule']}")

            if len(colors_info['color_rules']) > 10:
                print(f"  ... and {len(colors_info['color_rules']) - 10} more rules")

            # Take a screenshot for reference
            page.screenshot(path='animate_ui_screenshot.png', full_page=True)
            print(f"\nScreenshot saved as 'animate_ui_screenshot.png'")

        except Exception as e:
            print(f"Error: {e}")
            # Try to get page content for debugging
            try:
                page.screenshot(path='animate_ui_error.png')
                print("Error screenshot saved as 'animate_ui_error.png'")
            except:
                pass

        finally:
            browser.close()

if __name__ == "__main__":
    main()