'use client';

import { motion } from 'framer-motion';

export default function FeatureHighlights() {
  return (
    <section className="py-20 md:py-32 px-8 max-w-7xl mx-auto space-y-24 md:space-y-40 overflow-hidden">
      {/* Feature 1 */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Unbiased screening by default.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Activate Blind Mode to automatically strip names, contact information, and demographic indicators from resumes before evaluation. Focus purely on the signal.
          </p>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-[#fcfcfc] border border-border rounded-xl shadow-lg overflow-hidden group">
          <div className="bg-[#f3f4f6] px-4 py-3 border-b border-border flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#d1d5db]"></div>
            </div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              Blind Mode Active
            </div>
          </div>
          <div className="p-8 space-y-6 bg-white relative overflow-hidden">
            <div className="flex items-center gap-4">
              <motion.div 
                animate={{ filter: ["blur(0px)", "blur(12px)", "blur(12px)", "blur(0px)"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center font-serif text-xl"
              >
                JD
              </motion.div>
              <div>
                <motion.div 
                  animate={{ filter: ["blur(0px)", "blur(8px)", "blur(8px)", "blur(0px)"], backgroundColor: ["transparent", "#f3f4f6", "#f3f4f6", "transparent"] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="text-lg font-semibold text-foreground px-1 -mx-1"
                >
                  John Doe
                </motion.div>
                <motion.div 
                  animate={{ filter: ["blur(0px)", "blur(8px)", "blur(8px)", "blur(0px)"], backgroundColor: ["transparent", "#f3f4f6", "#f3f4f6", "transparent"] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="text-sm text-muted px-1 -mx-1 mt-0.5"
                >
                  johndoe@example.com
                </motion.div>
              </div>
            </div>
            <div className="space-y-4 font-mono text-sm pt-4 border-t border-border">
              <div className="flex justify-between items-center"><span className="text-muted">Experience</span><span className="text-foreground font-medium">8 Years, Frontend</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Top Skill</span><span className="text-foreground font-medium">React Architecture</span></div>
              <div className="flex justify-between items-center"><span className="text-muted">Location</span><span className="text-foreground font-medium">Remote (EST)</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 2 */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Deterministic JSON outputs.</h3>
          <p className="text-muted text-lg leading-relaxed">
            No more hallucinated parsing. Our multi-agent architecture forces structured ATS-ready JSON outputs, ready to export directly into your existing systems.
          </p>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-[#111111] border border-border rounded-xl shadow-2xl overflow-hidden group">
          <div className="bg-[#1a1a1a] px-4 py-3 border-b border-[#333] flex justify-between items-center">
            <div className="flex gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]"></div>
            </div>
            <div className="text-[10px] font-mono text-[#888]">candidate_export.json</div>
          </div>
          <div className="p-8 text-[#f8f8f2] font-mono text-sm leading-relaxed overflow-hidden relative">
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            />
            <pre>
<span className="text-[#f92672]">{`{`}</span>{`
  `}
<span className="text-[#a6e22e]">"candidate"</span>{`: `}<span className="text-[#e6db74]">"id_88321"</span>{`,
  `}
<span className="text-[#a6e22e]">"alignment_score"</span>{`: `}<span className="text-[#ae81ff]">0.94</span>{`,
  `}
<span className="text-[#a6e22e]">"skills_matched"</span>{`: [
    `}
<span className="text-[#e6db74]">"TypeScript"</span>{`,
    `}
<span className="text-[#e6db74]">"React"</span>{`,
    `}
<span className="text-[#e6db74]">"Next.js"</span>{`
  ],
  `}
<span className="text-[#a6e22e]">"recommendation"</span>{`: `}<span className="text-[#e6db74]">"Strong Hire"</span>{`
`}
<span className="text-[#f92672]">{`}`}</span>
            </pre>
          </div>
        </div>
      </div>

      {/* Feature 3: Evaluation Matrix */}
      <div className="feature-row flex flex-col md:flex-row items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Side-by-side evaluation matrix.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Compare candidates systematically. We generate a custom grading rubric based on your job description, and score each resume point-by-point, highlighting strengths and potential red flags.
          </p>
        </div>
        <div className="feature-panel slide-right flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-8 md:p-10 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-accent/50"></div>
          <div className="space-y-6">
            <div className="flex justify-between items-end pb-4 border-b border-border">
              <span className="text-lg font-serif text-foreground">Scorecard Matrix</span>
              <span className="text-xs text-muted font-medium bg-[#f3f4f6] px-2 py-1 rounded">2 Candidates</span>
            </div>
            <div className="space-y-6 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-muted mb-1">
                  <span className="w-1/3">Criteria</span>
                  <span className="w-1/3 text-center">Alex C.</span>
                  <span className="w-1/3 text-center">Sarah J.</span>
                </div>
                
                <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                  <span className="text-foreground font-medium w-1/3">Architecture</span>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '100%' }} viewport={{ once: false }} transition={{ duration: 1, ease: 'easeOut' }} className="h-full bg-accent"></motion.div>
                    </div>
                  </div>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '80%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.1, ease: 'easeOut' }} className="h-full bg-muted"></motion.div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center p-2 rounded hover:bg-[#f3f4f6] transition-colors">
                  <span className="text-foreground font-medium w-1/3">React.js</span>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '100%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.2, ease: 'easeOut' }} className="h-full bg-accent"></motion.div>
                    </div>
                  </div>
                  <div className="w-1/3 flex justify-center">
                    <div className="w-12 h-1.5 bg-border rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} whileInView={{ width: '90%' }} viewport={{ once: false }} transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }} className="h-full bg-muted"></motion.div>
                    </div>
                  </div>
                </div>

              </div>
              <div className="flex justify-between items-center pt-4 border-t border-border border-dashed bg-[#faf9f7] p-3 rounded">
                <span className="text-foreground font-semibold w-1/3">Match Score</span>
                <span className="text-accent font-bold w-1/3 text-center text-lg">96%</span>
                <span className="text-foreground font-semibold w-1/3 text-center text-lg">88%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 4: Outreach & Scheduling */}
      <div className="feature-row flex flex-col md:flex-row-reverse items-center gap-16 md:gap-24">
        <div className="feature-text flex-1">
          <h3 className="font-serif text-3xl md:text-4xl text-foreground mb-6">Automated outreach & scheduling.</h3>
          <p className="text-muted text-lg leading-relaxed">
            Generate highly personalized candidate engagement emails that adjust dynamically in tone. Lock in interview slots instantly with smart calendar conflict resolution.
          </p>
        </div>
        <div className="feature-panel slide-left flex-1 w-full bg-white border border-border rounded-xl shadow-lg p-1 overflow-hidden group">
          <div className="bg-[#fcfcfc] border-b border-border px-4 py-3 flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-[#f3f4f6] flex items-center justify-center text-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </div>
            <div className="text-xs font-medium text-muted">New Message</div>
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="ml-auto bg-accent text-white px-3 py-1 rounded text-xs font-medium shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              Send <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </motion.div>
          </div>
          <div className="p-6">
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8">To:</span>
              <span className="bg-[#f3f4f6] px-2 py-0.5 rounded text-foreground font-medium">Alex Chen</span>
            </div>
            <div className="flex gap-4 items-center border-b border-border pb-3 mb-4 text-sm">
              <span className="text-muted w-8">Sub:</span>
              <span className="text-foreground font-medium">Interview Invitation - Staff Engineer</span>
            </div>
            <div className="space-y-4 text-sm text-foreground leading-relaxed">
              <p>Hi Alex,</p>
              <p>I was very impressed with your work on the <strong className="bg-accent/10 text-accent px-1 rounded font-semibold">scaleable React architecture</strong> at your previous role. It aligns perfectly with what we are building.</p>
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                viewport={{ once: false }}
                className="border border-border rounded-lg p-4 bg-[#faf9f7] my-4 shadow-sm"
              >
                <div className="font-semibold mb-2 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  Select an interview time
                </div>
                <div className="flex gap-2">
                  <div className="bg-white border border-border px-3 py-2 rounded text-xs font-medium hover:border-accent hover:text-accent cursor-pointer transition-colors">Tomorrow, 2:00 PM</div>
                  <div className="bg-white border border-border px-3 py-2 rounded text-xs font-medium hover:border-accent hover:text-accent cursor-pointer transition-colors">Tomorrow, 4:00 PM</div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
