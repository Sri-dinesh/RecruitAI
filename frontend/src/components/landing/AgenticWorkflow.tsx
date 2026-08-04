'use client';

import { motion } from 'framer-motion';

export default function AgenticWorkflow() {
  return (
    <section className="scroll-section py-20 md:py-32 px-8 bg-[#faf9f7] border-y border-border overflow-hidden">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-serif text-3xl md:text-4xl text-foreground mb-4">The Agentic Workflow.</h2>
          <p className="text-muted text-lg max-w-2xl mx-auto">How our multi-agent architecture routes intent, executes rigorously, and guarantees deterministic outputs.</p>
        </div>

        <div className="relative p-8 md:p-12 bg-white border border-border rounded-xl shadow-lg">
          
          {/* Central connecting line for desktop */}
          <div className="absolute left-1/2 top-12 bottom-12 w-0.5 bg-[#f3f4f6] -translate-x-1/2 hidden md:block z-0">
            <motion.div 
              className="w-full h-1/3 bg-gradient-to-b from-transparent via-accent to-transparent opacity-50"
              animate={{ y: ["-100%", "300%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="relative z-10 space-y-12 md:space-y-16">
            
            {/* Step 1: Input */}
            <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
              <motion.div whileHover={{ scale: 1.03 }} className="bg-white border border-border px-6 py-4 rounded-lg shadow-sm flex items-center gap-4 min-w-[260px] cursor-default">
                <div className="w-12 h-12 bg-accent/10 rounded-md flex items-center justify-center text-accent shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2-2.4-3.5-4.4-3.5h-1.2c-.7-3-3.2-5.2-6.2-5.6-3-.3-5.9 1.3-7.3 4-1.2 2.5-1 6.5.5 8.8m8.7-1.6V21"/><path d="M16 16l-4-4-4 4"/></svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-foreground">User Request</div>
                  <div className="text-xs text-muted mt-1 font-medium">JD & Resume Upload</div>
                </div>
              </motion.div>
            </div>

            {/* Step 2: Supervisor */}
            <div className="flex flex-col md:flex-row items-center gap-6 justify-center">
              <motion.div whileHover={{ scale: 1.05 }} className="group bg-foreground text-white border border-foreground px-8 py-5 rounded-lg shadow-xl flex items-center gap-4 min-w-[320px] z-10 relative cursor-default">
                <div className="absolute -inset-1 bg-gradient-to-r from-accent via-[#ffbd2e] to-accent rounded-xl blur opacity-20 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <div className="w-12 h-12 bg-white/10 rounded-md flex items-center justify-center text-white relative z-10 shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                </div>
                <div className="relative z-10">
                  <div className="text-base font-bold">Supervisor Agent</div>
                  <div className="text-xs text-white/70 mt-1">Classifies intent & delegates tasks</div>
                </div>
              </motion.div>
            </div>

            {/* Step 3: Execution Nodes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {/* Horizontal connecting line for desktop */}
              <div className="absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-[#f3f4f6] -translate-y-1/2 hidden md:block z-0">
                <motion.div 
                  className="w-1/3 h-full bg-gradient-to-r from-transparent via-accent to-transparent opacity-50"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 0.5 }}
                />
              </div>

              <motion.div whileHover={{ y: -5 }} className="bg-white border border-border p-6 rounded-lg shadow-sm text-center relative z-10 cursor-default hover:border-accent/30 transition-colors">
                <div className="text-sm font-bold text-foreground mb-1.5">JD Agent</div>
                <div className="text-xs text-muted leading-relaxed">Extracts role requirements and rewrites context</div>
              </motion.div>
              
              <motion.div whileHover={{ y: -5 }} className="bg-white border border-accent border-b-4 p-6 rounded-lg shadow-md text-center relative z-10 cursor-default">
                <div className="text-sm font-bold text-foreground mb-1.5">Screening Agent</div>
                <div className="text-xs text-muted leading-relaxed">Performs advanced RAG over pgvector candidate store</div>
              </motion.div>
              
              <motion.div whileHover={{ y: -5 }} className="bg-white border border-border p-6 rounded-lg shadow-sm text-center relative z-10 cursor-default hover:border-accent/30 transition-colors">
                <div className="text-sm font-bold text-foreground mb-1.5">Action Agent</div>
                <div className="text-xs text-muted leading-relaxed">Schedules interviews & drafts outreach emails</div>
              </motion.div>
            </div>

            {/* Step 4: Output */}
            <div className="flex flex-col md:flex-row items-center gap-6 justify-center pt-2">
              <motion.div whileHover={{ scale: 1.03 }} className="bg-[#111] text-[#f8f8f2] border border-[#333] px-8 py-5 rounded-lg shadow-xl flex items-center gap-4 min-w-[300px] cursor-default">
                <div className="w-12 h-12 bg-[#333] rounded-md flex items-center justify-center text-[#a6e22e] shrink-0">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                </div>
                <div>
                  <div className="text-sm font-bold font-mono">Structured Output</div>
                  <div className="text-xs text-[#888] font-mono mt-1">Deterministic ATS payload</div>
                </div>
              </motion.div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
