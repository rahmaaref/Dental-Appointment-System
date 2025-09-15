import re

def _get_phone_from_request(req):
    # Prefer multipart form first
    raw = req.form.get('phone')
    if raw is None:
        # Fallback if someone sends JSON by mistake
        try:
            raw = (req.get_json(silent=True) or {}).get('phone')
        except Exception:
            raw = None
    if raw is None:
        return ''

    s = str(raw).strip()

    # If the client mistakenly sent a number, it will look like '1234567890'.
    # Rescue by left-padding to 11 if it's only 10 digits and doesn't start with 0.
    only_digits = ''.join(ch for ch in s if ch.isdigit())
    if len(only_digits) == 10 and not only_digits.startswith('0'):
        only_digits = '0' + only_digits  # recover '0' prefix

    return only_digits

# Test with a mock request object
class MockRequest:
    def __init__(self, form_data):
        self.form = form_data
    
    def get_json(self, silent=True):
        return None

# Test the function
mock_req = MockRequest({'phone': '01234567890'})
phone = _get_phone_from_request(mock_req)
print(f'Extracted phone: "{phone}"')
print(f'Length: {len(phone)}')
print(f'Regex match: {bool(re.fullmatch(r"0\\d{10}", phone))}')

