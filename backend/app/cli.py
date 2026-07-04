import sys
import os
from pathlib import Path
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table

# Add backend/ to Python search path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.graph.builder import graph
from app.graph.state import RecruitState
from app.core.logging import get_all_logs

console = Console()

def print_trace_table():
    """
    Prints a beautiful table displaying the structured routing decision logs.
    """
    logs = get_all_logs()
    if not logs:
        console.print("[yellow]No routing decisions have been logged in this session yet.[/yellow]")
        return
        
    table = Table(title="Agent Decision Trace Logs", border_style="cyan")
    table.add_column("Turn", justify="center", style="cyan")
    table.add_column("Node Handler", justify="left", style="green")
    table.add_column("Classified Intent", justify="left", style="magenta")
    table.add_column("Confidence", justify="right", style="yellow")
    table.add_column("LLM Provider", justify="left", style="blue")
    table.add_column("Latency (ms)", justify="right", style="red")
    
    for l in logs:
        table.add_row(
            str(l.get("turn", "")),
            l.get("node", ""),
            l.get("intent", ""),
            f"{l.get('confidence', 0.0):.2f}",
            l.get("provider", ""),
            f"{l.get('latency_ms', 0):d}"
        )
    console.print(table)

def run_repl():
    # Print welcome banner
    console.print(Panel(
        "[bold green]RecruitAI MVP conversational REPL[/bold green]\n\n"
        "Interface with the agent using natural language:\n"
        "- Load context: [italic]'load JD and resumes'[/italic]\n"
        "- Fetch live JD: [italic]'fetch JD for Frontend Developer via API'[/italic]\n"
        "- Count: [italic]'how many applicants do we have?'[/italic]\n"
        "- Screen: [italic]'screen candidate matching'[/italic]\n"
        "- Rewrite: [italic]'rewrite this JD for a startup'[/italic]\n"
        "- Prep Qs: [italic]'prep questions for the top candidate'[/italic]\n"
        "- Salaries: [italic]'market salary range for this role'[/italic]\n"
        "- Finalize: [italic]'finalize the shortlist'[/italic]\n\n"
        "Commands:\n"
        "- Type [bold cyan]/trace[/bold cyan] to view agent decision logs.\n"
        "- Type [bold red]exit[/bold red] to end the session.",
        title="RecruitAI v2.0",
        border_style="green"
    ))
    
    # Initialize RecruitState
    state: RecruitState = {
        "jd_structured": None,
        "resumes": [],
        "conversation_history": [],
        "last_shortlist": None,
        "pending_confirmation": None,
        "last_intent": None
    }
    
    while True:
        try:
            # Command Prompt
            user_input = console.input("\n[bold blue]You:[/bold blue] ")
            
            if user_input.strip().lower() in ["exit", "quit", "q"]:
                console.print("[yellow]Session ended. Goodbye![/yellow]")
                break
                
            if not user_input.strip():
                continue
                
            # Handle special slash commands
            if user_input.strip().lower() == "/trace":
                print_trace_table()
                continue
                
            # Append user message to conversation history
            state["conversation_history"].append({"role": "user", "content": user_input})
            
            # Show a thinking spinner
            with console.status("[bold green]RecruitAI is thinking...[/bold green]", spinner="dots"):
                try:
                    # Run the state graph
                    result = graph.invoke(state)
                    # Persist state updates across turns
                    state = result
                except Exception as e:
                    # Global error handler (Section 6.2, 6.5) - prevents CLI crashes
                    error_message = (
                        "I'm hitting a temporary limit or experiencing a connectivity issue on my side. "
                        "Please verify your API keys and database credentials, and try again in a moment."
                    )
                    state["conversation_history"].append({"role": "assistant", "content": error_message})
                    print(f"\n[DEBUG ERROR] Graph execution crashed: {e}")
            
            # Print assistant response in Markdown
            assistant_response = state["conversation_history"][-1]["content"]
            console.print("\n[bold green]RecruitAI:[/bold green]")
            console.print(Markdown(assistant_response))
            
        except KeyboardInterrupt:
            console.print("\n[yellow]Session interrupted. Goodbye![/yellow]")
            break
        except Exception as e:
            console.print(f"\n[bold red]Fatal REPL Loop Error: {e}[/bold red]")
            break

if __name__ == "__main__":
    run_repl()
