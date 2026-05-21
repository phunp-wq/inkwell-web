#!/usr/bin/env python3
# Reads HTML from stdin, extracts article content using Trafilatura, outputs JSON to stdout.
# Usage: echo "<html>..." | python3 trafilatura_extract.py <url>
import sys
import json

try:
    import trafilatura
except ImportError:
    print(json.dumps({'success': False, 'error': 'trafilatura not installed. Run: pip install trafilatura lxml_html_clean'}))
    sys.exit(1)

url = sys.argv[1] if len(sys.argv) > 1 else ''

try:
    html = sys.stdin.buffer.read()
    if not html:
        print(json.dumps({'success': False, 'error': 'No HTML received on stdin'}))
        sys.exit(1)

    result = trafilatura.extract(
        html,
        url=url or None,
        include_comments=False,
        include_tables=True,
        output_format='json',
        with_metadata=True,
        favor_precision=True
    )

    if not result:
        print(json.dumps({'success': False, 'error': 'Trafilatura could not extract article'}))
        sys.exit(1)

    data = json.loads(result)
    text = data.get('text', '').strip()
    if not text:
        print(json.dumps({'success': False, 'error': 'Extracted text is empty'}))
        sys.exit(1)

    print(json.dumps({
        'success': True,
        'title': data.get('title', ''),
        'text': text,
        'author': data.get('author', ''),
        'sitename': data.get('sitename', ''),
        'wordCount': len(text.split())
    }, ensure_ascii=False))

except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
    sys.exit(1)
