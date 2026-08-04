export default function TechnologyStack() {
  return (
    <section className="scroll-section py-20 md:py-32 px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-6">The Technology Stack.</h2>
        <p className="text-muted text-lg leading-relaxed">
          RecruitAI is engineered for scale and determinism. We leverage state-of-the-art agentic frameworks paired with robust vector stores to ensure absolute precision in talent evaluation.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-border p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 bg-[#f3f4f6] rounded-md flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-foreground group-hover:text-accent transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          </div>
          <h4 className="font-semibold text-foreground text-lg mb-2">LangGraph</h4>
          <p className="text-muted text-sm leading-relaxed">Multi-agent orchestrator managing distinct workflows for ingest, retrieval, and synthesis.</p>
        </div>
        
        <div className="bg-white border border-border p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 bg-[#f3f4f6] rounded-md flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-foreground group-hover:text-accent transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="14.31" y1="8" x2="20.05" y2="17.94"></line><line x1="9.69" y1="8" x2="21.17" y2="8"></line><line x1="7.38" y1="12" x2="13.12" y2="2.06"></line><line x1="9.69" y1="16" x2="3.95" y2="6.06"></line><line x1="14.31" y1="16" x2="2.83" y2="16"></line><line x1="16.62" y1="12" x2="10.88" y2="21.94"></line></svg>
          </div>
          <h4 className="font-semibold text-foreground text-lg mb-2">Next.js 16</h4>
          <p className="text-muted text-sm leading-relaxed">Premium App Router frontend delivering instant client-side interactions and SSR capabilities.</p>
        </div>
        
        <div className="bg-white border border-border p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 bg-[#f3f4f6] rounded-md flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-foreground group-hover:text-accent transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline><polyline points="7.5 19.79 7.5 14.6 3 12"></polyline><polyline points="21 12 16.5 14.6 16.5 19.79"></polyline><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          </div>
          <h4 className="font-semibold text-foreground text-lg mb-2">FastAPI</h4>
          <p className="text-muted text-sm leading-relaxed">High-performance async Python backend executing rigorous evaluation pipelines flawlessly.</p>
        </div>

        <div className="bg-white border border-border p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow group">
          <div className="w-10 h-10 bg-[#f3f4f6] rounded-md flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-foreground group-hover:text-accent transition-colors" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
          </div>
          <h4 className="font-semibold text-foreground text-lg mb-2">Supabase</h4>
          <p className="text-muted text-sm leading-relaxed">Native PostgreSQL vector embeddings via pgvector for highly accurate semantic talent search.</p>
        </div>
      </div>
    </section>
  );
}
