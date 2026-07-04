import sys
from pathlib import Path

# Add backend/ to search path
sys.path.append(str(Path(__file__).resolve().parent))

def main():
    print("=" * 50)
    print("            RecruitAI Agent Launcher")
    print("=" * 50)
    print("Select backend operation mode:")
    print("1. Server Mode (FastAPI server for Next.js UI on port 8000)")
    print("2. CLI Mode (Interactive Terminal Chatbot REPL)")
    print("=" * 50)
    
    try:
        choice = input("Enter option (1 or 2): ").strip()
        if choice == "1":
            print("\nLaunching FastAPI Server...")
            from app.main import start_server
            start_server()
        elif choice == "2":
            print("\nLaunching Interactive CLI...")
            from app.cli import run_repl
            run_repl()
        else:
            print("Invalid option. Exiting launcher.")
            sys.exit(0)
    except KeyboardInterrupt:
        print("\nLauncher interrupted. Exiting.")
        sys.exit(0)

if __name__ == "__main__":
    main()
