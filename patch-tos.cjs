const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Add state
code = code.replace(
  'const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);',
  'const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);\n  const [showTermsOfService, setShowTermsOfService] = useState(false);'
);

// Add effect
const effectTarget = `    if (window.location.hash === '#privacy-policy' || window.location.hash === '#privacy') {
      setShowPrivacyPolicy(true);
    }`;
const effectReplacement = `    if (window.location.hash === '#privacy-policy' || window.location.hash === '#privacy') {
      setShowPrivacyPolicy(true);
    }
    if (window.location.hash === '#terms' || window.location.hash === '#tos') {
      setShowTermsOfService(true);
    }`;
code = code.replace(effectTarget, effectReplacement);

// Add footer link
const footerTarget = `<a href="#privacy" onClick={(e) => { e.preventDefault(); window.location.hash = 'privacy'; setShowPrivacyPolicy(true); }} className="hover:text-emerald-400 inline-block">Privacy Policy</a>`;
const footerReplacement = `<a href="#privacy" onClick={(e) => { e.preventDefault(); window.location.hash = 'privacy'; setShowPrivacyPolicy(true); }} className="hover:text-emerald-400 inline-block">Privacy Policy</a>\n            <a href="#terms" onClick={(e) => { e.preventDefault(); window.location.hash = 'terms'; setShowTermsOfService(true); }} className="hover:text-emerald-400 inline-block">Terms of Service</a>`;
code = code.replace(footerTarget, footerReplacement);

// Add modal
const modalHTML = `
      {/* Terms of Service Modal */}
      {showTermsOfService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowTermsOfService(false)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100">Terms of Service</h3>
              <button onClick={() => setShowTermsOfService(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto w-full text-slate-300 leading-relaxed text-sm">
              <p className="mb-4"><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</p>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">1. Acceptance of Terms</h4>
              <p className="mb-4">By accessing or using Tech Habesha, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access our website.</p>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">2. Use of Content & Intellectual Property</h4>
              <p className="mb-2">Tech Habesha is a technology news aggregator. The original news articles and trademarks remain the property of their respective owners.</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>We provide links, excerpts, and summaries for informational purposes only.</li>
                <li>The Tech Habesha logo, custom design elements, and original code are our intellectual property and may not be copied without permission.</li>
              </ul>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">3. Disclaimer of Warranties</h4>
              <p className="mb-4">All information is provided "as is" and "as available". Tech Habesha makes no warranties, expressed or implied, regarding the accuracy, completeness, or reliability of the information provided by third-party news sources. We are not responsible for decisions made based on the news aggregated on our platform.</p>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">4. Limitation of Liability</h4>
              <p className="mb-4">In no event shall Tech Habesha or its administrators be liable for any indirect, incidental, special, or consequential damages arising out of or in any way connected with the use of this website or the information contained herein.</p>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">5. User Conduct</h4>
              <p className="mb-4">Users agree not to use the website for any unlawful purpose or any purpose prohibited under this clause. Users agree not to interfere with the proper functioning of the website or compromise its security.</p>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">6. Changes to Terms</h4>
              <p className="mb-4">We reserve the right to modify or replace these Terms at any time. We will try to provide noticeable changes when major updates occur.</p>
              
              <div className="mt-8 flex justify-end">
                <button onClick={() => setShowTermsOfService(false)} className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-2 rounded-lg font-bold transition-colors cursor-pointer">
                  I Understand
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace('{/* Privacy Policy Modal */}', modalHTML + '\n      {/* Privacy Policy Modal */}');

fs.writeFileSync('src/App.tsx', code);
