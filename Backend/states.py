import re

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

# Abbreviations that are also normal English words: only count them in CAPITALS
AMBIGUOUS = {"IN", "OR", "ME", "OK", "HI", "OH", "ID"}

# Longest names first, so "West Virginia" is checked before "Virginia"
FULL_NAMES = sorted(STATES.values(), key=len, reverse=True)


def detect_state(text):
    lower = text.lower()

    # 1. Full state names (whole words only)
    for name in FULL_NAMES:
        if re.search(rf"\b{re.escape(name.lower())}\b", lower):
            return name

    # 2. Two-letter abbreviations
    for token in re.findall(r"\b[A-Za-z]{2}\b", text):
        abbr = token.upper()
        if abbr not in STATES:
            continue
        if abbr in AMBIGUOUS and token != abbr:
            continue   # "in" = word, "IN" = Indiana
        return STATES[abbr]

    return None