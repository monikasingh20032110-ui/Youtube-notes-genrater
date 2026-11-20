"""
Pre-populate high-yield educational lectures into EduScribe AI SQLite database
"""
import os
import sys
from dotenv import load_dotenv

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv()

from core.database import NotesDatabase
from core.ai_generator import AINotesGenerator
import markdown

LECTURES = [
    {
        "video_id": "fNk_zzaMoSs",
        "video_url": "https://www.youtube.com/watch?v=fNk_zzaMoSs",
        "title": "Vectors | Chapter 1, Essence of linear algebra",
        "channel": "3Blue1Brown",
        "thumbnail_url": "https://i.ytimg.com/vi/fNk_zzaMoSs/maxresdefault.jpg",
        "duration_formatted": "09:52",
        "note_style": "comprehensive",
        "sample_transcript": """
[00:00] The introduction of linear algebra begins with the most fundamental building block: the vector.
[00:30] Depending on who you ask, vectors have three completely different meanings.
[01:05] To a physics student, a vector is an arrow pointing in space. It has a specific length (magnitude) and direction. It can be moved anywhere as long as length and direction stay the same.
[02:15] To a computer science student, a vector is simply an ordered list of numbers. For example, a house could be modeled as a 2D vector with square footage and price.
[03:40] To a mathematician, a vector can be anything where you can add two vectors or multiply a vector by a scalar number.
[04:50] In linear algebra, we coordinate the geometric view and numerical view using the Cartesian coordinate system.
[05:30] The root of a vector is anchored at the origin (0,0). A vector [3, -2] means starting at the origin, move 3 units right along the x-axis, and 2 units down along the y-axis.
[06:45] Vector addition: If you add vector v and vector w, you place the tail of w at the tip of v, and the resulting vector connects origin to the final tip.
[07:50] Numerically, vector addition is performed coordinate by coordinate: [x1, y1] + [x2, y2] = [x1+x2, y1+y2].
[08:30] Scalar multiplication: Scaling means stretching, squishing, or reversing the direction of a vector by multiplying it by a number called a scalar.
[09:20] Linear combinations and spans form the core intuition for basis vectors and matrices in modern machine learning and physics.
"""
    },
    {
        "video_id": "tpIctyqH29Q",
        "video_url": "https://www.youtube.com/watch?v=tpIctyqH29Q",
        "title": "Early Computing: Crash Course Computer Science #1",
        "channel": "CrashCourse",
        "thumbnail_url": "https://i.ytimg.com/vi/tpIctyqH29Q/maxresdefault.jpg",
        "duration_formatted": "11:50",
        "note_style": "quick",
        "sample_transcript": """
[00:00] Welcome to Crash Course Computer Science! Today we explore the origins of computing before microchips and smartphones existed.
[01:10] The earliest recognized computing device is the Abacus, invented around 2500 BCE in Mesopotamia to help humans store and manipulate large numbers.
[02:30] In the 1600s, Gottfried Wilhelm Leibniz created the Step Reckoner, a mechanical calculator that could add, subtract, multiply, and divide using a stepped gear cylinder.
[04:00] During the Industrial Revolution, complex calculations like artillery trajectory tables and navigational star charts were calculated by rooms of human 'computers', leading to frequent errors.
[05:25] Charles Babbage conceived the Difference Engine in 1822 to calculate polynomial functions automatically without human error.
[07:00] Babbage then designed the Analytical Engine, the first general-purpose computer concept featuring an arithmetic logic unit (the 'mill') and memory (the 'store').
[08:15] Ada Lovelace wrote the world's first computer algorithm for the Analytical Engine to calculate Bernoulli numbers, making her the world's first programmer.
[09:40] In 1890, Herman Hollerith developed the Punched Card Tabulating Machine for the US Census, which saved years of labor and gave birth to IBM.
[10:50] These mechanical machines laid the structural foundation for electronic, digital computing in the 20th century.
"""
    },
    {
        "video_id": "kqtD5dpn9C8",
        "video_url": "https://www.youtube.com/watch?v=kqtD5dpn9C8",
        "title": "Python Tutorial for Beginners - Full Course",
        "channel": "Programming with Mosh",
        "thumbnail_url": "https://i.ytimg.com/vi/kqtD5dpn9C8/maxresdefault.jpg",
        "duration_formatted": "60:00",
        "note_style": "code_math",
        "sample_transcript": """
[00:00] In this tutorial, you will learn the fundamentals of Python, the most popular programming language in the world for AI, web development, and data science.
[03:20] Variables in Python: You store data in computer memory using variables. Example: age = 20, price = 19.95, first_name = 'Mosh', is_online = True.
[07:15] Receiving user input: Use the input() function to read strings from the console: name = input('What is your name? ').
[12:30] Type Conversion: Python is strongly typed. Use int(), float(), str(), or bool() to convert values before performing arithmetic.
[18:40] Strings & String Methods: Strings have built-in methods like course.upper(), course.find('Python'), and course.replace('x', 'y').
[26:10] Arithmetic & Comparison Operators: + , - , * , / (float), // (integer division), % (modulus), and ** (exponent). Comparison operators return booleans: >, <, >=, <=, ==, !=.
[34:50] Logical Operators and If Statements: Use and, or, not to combine conditions. if temperature > 30: print('Hot day') elif temperature > 20: print('Nice day') else: print('Cold day').
[42:15] While Loops and For Loops: while i <= 5: executes a block repeatedly. for item in numbers: iterates over collections.
[50:30] Lists and Tuples: Lists are mutable arrays [1, 2, 3], while tuples are immutable (1, 2, 3) which cannot be modified after creation.
"""
    }
]

def populate():
    db = NotesDatabase()
    ai = AINotesGenerator()
    print("Pre-populating educational lectures...")

    for lec in LECTURES:
        # Check if already exists
        existing = db.get_latest_by_video_id(lec["video_id"])
        if existing:
            print(f"✓ Already in database: {lec['title']}")
            continue

        print(f"Generating notes for: {lec['title']}...")
        res = ai.generate_lecture_notes(
            transcript_text=lec["sample_transcript"],
            video_title=lec["title"],
            channel_name=lec["channel"],
            note_style=lec["note_style"]
        )

        md_text = res.get("notes_markdown", "")
        html_content = markdown.markdown(md_text, extensions=['extra', 'sane_lists', 'tables', 'nl2br'])
        note_id = db.save_note({
            "video_id": lec["video_id"],
            "video_url": lec["video_url"],
            "title": lec["title"],
            "channel": lec["channel"],
            "thumbnail_url": lec["thumbnail_url"],
            "duration_formatted": lec["duration_formatted"],
            "note_style": lec["note_style"],
            "notes_markdown": md_text,
            "notes_html": html_content,
            "flashcards": res.get("flashcards", []),
            "quiz": res.get("quiz", []),
            "mindmap_mermaid": res.get("mindmap_mermaid", "")
        })
        print(f"✓ Saved note #{note_id}: {lec['title']}")

    print("All educational lectures pre-populated successfully!")

if __name__ == '__main__':
    populate()
