const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const stateInsert = `  const [allowVoiceFeedback, setAllowVoiceFeedback] = useState(true);
  const allowVoiceFeedbackRef = useRef(true);
  useEffect(() => { allowVoiceFeedbackRef.current = allowVoiceFeedback; }, [allowVoiceFeedback]);
  const [allowVoiceCommand, setAllowVoiceCommand] = useState(true);
  const allowVoiceCommandRef = useRef(true);
  useEffect(() => { allowVoiceCommandRef.current = allowVoiceCommand; }, [allowVoiceCommand]);`;

content = content.replace(/  const \[allowVoiceFeedback, setAllowVoiceFeedback\] = useState\(true\);\n  const allowVoiceFeedbackRef = useRef\(true\);\n  useEffect\(\(\) => \{ allowVoiceFeedbackRef\.current = allowVoiceFeedback; \}, \[allowVoiceFeedback\]\);/, stateInsert);

const effectStartRegex = /  \/\/ Background Speech Recognition for Safety Word\n  useEffect\(\(\) => \{\n    if \(isEmergency \|\| isVoiceActive \|\| isChatbotModalOpen\) \{/g;
const effectStartInsert = `  // Background Speech Recognition for Safety Word
  useEffect(() => {
    if (isEmergency || isVoiceActive || isChatbotModalOpen || !allowVoiceCommand) {`;

content = content.replace(effectStartRegex, effectStartInsert);

const effectEndRegex = /  \}, \[isEmergency, isVoiceActive, isMonitoring, safetyWord, isChatbotModalOpen\]\);/g;
const effectEndInsert = `  }, [isEmergency, isVoiceActive, isMonitoring, safetyWord, isChatbotModalOpen, allowVoiceCommand]);`;

content = content.replace(effectEndRegex, effectEndInsert);

const uiRegex = /              <div className="flex items-center justify-between p-4 bg-slate-950\/50 border border-slate-800 rounded-2xl">\n                <div>\n                  <h4 className="text-sm font-bold text-white mb-1">Voice Feedback<\/h4>/;
const uiInsert = `              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Voice Commands</h4>
                  <p className="text-[10px] text-slate-400">Allow background voice recognition</p>
                </div>
                <div 
                  onClick={() => setAllowVoiceCommand(!allowVoiceCommand)}
                  className={\`w-12 h-6 rounded-full relative cursor-pointer transition-colors \${allowVoiceCommand ? 'bg-blue-500' : 'bg-slate-700'}\`}
                >
                  <div className={\`absolute top-1 w-4 h-4 bg-white rounded-full transition-all \${allowVoiceCommand ? 'right-1' : 'left-1'}\`}></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Voice Feedback</h4>`;

content = content.replace(uiRegex, uiInsert);

fs.writeFileSync('src/App.tsx', content);
