import os
from app.graph.builder import graph

def generate_workflow_graph():
    """
    Generates visual and text-based representation of the LangGraph workflow.
    """
    output_dir = os.path.join(os.path.dirname(__file__), "..", "docs")
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Generate Mermaid Markdown representation
    try:
        mermaid_code = graph.get_graph().draw_mermaid()
        mermaid_file = os.path.join(output_dir, "workflow_graph.md")
        with open(mermaid_file, "w", encoding="utf-8") as f:
            f.write("# RecruitAI Multi-Agent Workflow Graph\n\n")
            f.write("Below is the Mermaid representation of the Multi-Agent Supervisor LangGraph:\n\n")
            f.write("```mermaid\n")
            f.write(mermaid_code)
            f.write("\n```\n")
        print(f"[SUCCESS] Saved Mermaid graph markdown to {os.path.abspath(mermaid_file)}")
    except Exception as e:
        print(f"[ERROR] Failed to generate Mermaid text representation: {e}")
        
    # 2. Attempt to generate PNG file
    try:
        png_bytes = graph.get_graph().draw_mermaid_png()
        png_file = os.path.join(output_dir, "workflow_graph.png")
        with open(png_file, "wb") as f:
            f.write(png_bytes)
        print(f"[SUCCESS] Saved visual graph image to {os.path.abspath(png_file)}")
    except Exception as e:
        print(f"[NOTE] PNG visualization generation bypassed (requires pygraphviz/mermaid-cli): {e}")

if __name__ == "__main__":
    generate_workflow_graph()
