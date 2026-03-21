import re
import spacy
from typing import List, Dict

# Load the lightweight English NLP model into memory.
# We do this globally so it only loads once when the server starts, not on every request.
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    raise OSError(
        "spaCy model 'en_core_web_sm' not found. "
        "Please run: python -m spacy download en_core_web_sm"
    )

def clean_pdf_text(raw_text: str) -> str:
    """
    Cleans messy PDF text by fixing hyphenation and removing broken newlines.
    """
    if not raw_text:
        return ""

    # 1. Fix hyphenated words split across line breaks (e.g., "ex- \n ample" -> "example")
    # This regex looks for a hyphen, followed by optional spaces, a newline, and optional spaces.
    text = re.sub(r'-\s*\n\s*', '', raw_text)

    # 2. Replace remaining single newlines with a space.
    # PDFs often hard-wrap lines in the middle of a sentence.
    text = re.sub(r'\s*\n\s*', ' ', text)

    # 3. Collapse multiple spaces or tabs into a single space.
    text = re.sub(r'\s+', ' ', text)

    # 4. Strip leading and trailing whitespace.
    return text.strip()

def chunk_text(raw_text: str) -> List[Dict[str, str | int]]:
    """
    Takes raw text from a PDF, cleans it, and tokenizes it into structured sentences.
    
    Returns:
        A list of dictionaries containing a sequential 'id' and the 'text'.
        Example: [{"id": 0, "text": "First sentence."}, {"id": 1, "text": "Second sentence."}]
    """
    cleaned_text = clean_pdf_text(raw_text)
    
    if not cleaned_text:
        return []

    # Let spaCy parse the cleaned text to find true sentence boundaries
    doc = nlp(cleaned_text)
    
    sentences = []
    sentence_id = 0
    
    for sent in doc.sents:
        # Get the string version of the sentence and strip any lingering edge spaces
        sent_str = sent.text.strip()
        
        # Ignore empty strings or strings that are just punctuation
        if sent_str and len(sent_str) > 1:
            sentences.append({
                "id": sentence_id,
                "text": sent_str
            })
            sentence_id += 1
            
    return sentences

# --- Quick Local Test ---
# If you run this file directly (python src/utils/chunking.py), it will test itself.
if __name__ == "__main__":
    messy_pdf_input = (
        "This is the first sen-\n"
        "tence. Dr. Smith said we should \n"
        "keep going! What about e.g. \n"
        "this abbreviation? It works perfectly."
    )
    
    print("--- RAW TEXT ---")
    print(messy_pdf_input)
    print("\n--- CHUNKED OUTPUT ---")
    
    output = chunk_text(messy_pdf_input)
    for chunk in output:
        print(chunk)