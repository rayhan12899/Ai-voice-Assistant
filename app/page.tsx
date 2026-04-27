"use client";

import React, { useState, useEffect, useRef } from "react";
import { Mic, Upload, StopCircle, RefreshCw, Languages, Copy, Check, Info, Bot, Sparkles, Moon, Sun, Settings, Key } from "lucide-react";
import { useTheme } from "next-themes";
import { refineTextToAI, transcribeAudio, translateWithVocab } from "@/lib/gemini";
import { motion, AnimatePresence } from "motion/react";

const getBase64FromBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });

export default function Home() {
  const { theme, setTheme } = useTheme();
  
  // Tabs
  const [mainTab, setMainTab] = useState<"Voice" | "Upload">("Voice");
  const [outputTab, setOutputTab] = useState<"Original" | "Refine" | "AI Prompt">("Original");
  const [showSettings, setShowSettings] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  
  // Voice State
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"bn-BD" | "en-US">("bn-BD");
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Stable refs
  const isRecordingRef = useRef(false);
  const interimIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTranscribingInterimRef = useRef(false);
  const fullTranscriptRef = useRef("");

  // Upload State
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Processed Text State
  const [refinedText, setRefinedText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptTarget, setPromptTarget] = useState<"ChatGPT" | "Image" | "Video">("ChatGPT");
  const [isProcessing, setIsProcessing] = useState(false);

  // Translation State
  const [translation, setTranslation] = useState("");
  const [vocab, setVocab] = useState<{ word: string; meaning: string }[]>([]);
  const [translateTarget, setTranslateTarget] = useState<"English" | "Bangla">("English");
  const [isTranslating, setIsTranslating] = useState(false);
  
  // Auto-translate Settings 
  const [autoTranslate, setAutoTranslate] = useState(true);
  const translateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranslatedTextRef = useRef("");
  const translateTokenRef = useRef(0);

  // General State
  const [copying, setCopying] = useState(false);

  const toggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      isRecordingRef.current = false;
      setIsRecording(false);
      if (interimIntervalRef.current) clearInterval(interimIntervalRef.current);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
           if (interimIntervalRef.current) clearInterval(interimIntervalRef.current);
           const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
           setIsTranscribing(true);
           try {
             const base64 = await getBase64FromBlob(audioBlob);
             const langHint = voiceLang === "bn-BD" ? "Bangla" : "English";
             const text = await transcribeAudio(base64, audioBlob.type || 'audio/webm', langHint, customApiKey);
             // Final transcription text
             const newTrans = text.trim();
             setTranscript(newTrans);
             fullTranscriptRef.current = newTrans;
             setOutputTab("Original");
             
             // Auto refine when stopping!
             if (newTrans.length > 0) {
                 setOutputTab("Refine"); // Automatically switch to refine tab when done speaking
                 // The useEffect will pick this up and run processText("Refine")
             }
           } catch (err: any) {
             console.error("Transcribe err:", err.message);
           } finally {
             setIsTranscribing(false);
           }
        };
        
        mediaRecorder.start(1000); // 1-second chunks
        isRecordingRef.current = true;
        setIsRecording(true);
        setTranscript("");
        fullTranscriptRef.current = "";

        // Pseudo-realtime interval processing
        interimIntervalRef.current = setInterval(async () => {
          if (isTranscribingInterimRef.current || audioChunksRef.current.length === 0 || !isRecordingRef.current) return;
          isTranscribingInterimRef.current = true;
          try {
            const currentBlob = new Blob([...audioChunksRef.current], { type: mediaRecorder.mimeType });
            const base64 = await getBase64FromBlob(currentBlob);
            const langHint = voiceLang === "bn-BD" ? "Bangla" : "English";
            const text = await transcribeAudio(base64, currentBlob.type || 'audio/webm', langHint, customApiKey);
            if (isRecordingRef.current && text && text.trim().length > 0) {
                const newTrans = text.trim();
                setTranscript(newTrans);
                fullTranscriptRef.current = newTrans;
                setOutputTab("Original");
            }
          } catch (e) {
            // ignore interim transcription errors silently
          } finally {
            isTranscribingInterimRef.current = false;
          }
        }, 1500);

      } catch (err) {
        console.error(err);
        alert("Microphone access denied or not available. Please allow microphone permissions.");
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAudioFile(e.target.files[0]);
    }
  };

  const processAudioFile = async () => {
    if (!audioFile) return;
    setIsTranscribing(true);
    setTranscript("");
    fullTranscriptRef.current = "";
    resetProcessed();
    try {
      const base64 = await getBase64FromBlob(audioFile);
      const text = await transcribeAudio(base64, audioFile.type, undefined, customApiKey);
      setTranscript(text);
      fullTranscriptRef.current = text;
      setOutputTab("Original");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const resetProcessed = () => {
    setRefinedText("");
    setPromptText("");
    setTranslation("");
    setVocab([]);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const processText = async (mode: "Refine" | "AI Prompt") => {
    if (!transcript) return;
    setIsProcessing(true);
    try {
      const res = await refineTextToAI(transcript, mode, promptTarget, customApiKey);
      if (mode === "Refine") setRefinedText(res);
      else setPromptText(res);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const doTranslate = async (overrideText?: string) => {
    const textToTranslate = typeof overrideText === 'string' ? overrideText : getActiveText();
    if (!textToTranslate || !textToTranslate.trim()) return;
    if (textToTranslate.trim() === lastTranslatedTextRef.current) return;
    
    const currentToken = ++translateTokenRef.current;
    setIsTranslating(true);
    
    try {
      const { translation: tText, vocabulary } = await translateWithVocab(textToTranslate.trim(), translateTarget, customApiKey);
      if (currentToken === translateTokenRef.current) {
        setTranslation(tText);
        setVocab(vocabulary);
        lastTranslatedTextRef.current = textToTranslate.trim();
        setIsTranslating(false);
      }
    } catch (err: any) {
      if (currentToken === translateTokenRef.current) {
        console.error(err);
        setIsTranslating(false);
      }
    }
  };

  // Auto-translate effect
  useEffect(() => {
    if (autoTranslate && transcript.trim()) {
       if (translateTimeoutRef.current) clearTimeout(translateTimeoutRef.current);
       translateTimeoutRef.current = setTimeout(() => {
           if (outputTab === "Original" && transcript.trim() !== lastTranslatedTextRef.current) {
               doTranslate(transcript);
           }
       }, 800); // Automatically translate after 800ms of silence
    }
    return () => {
       if (translateTimeoutRef.current) clearTimeout(translateTimeoutRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, autoTranslate, outputTab]);

  useEffect(() => {
    if (outputTab === "Refine" && !refinedText && transcript && !isProcessing) {
      processText("Refine");
    }
    if (outputTab === "AI Prompt" && !promptText && transcript && !isProcessing) {
      processText("AI Prompt");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputTab, promptTarget]);

  const getActiveText = () => {
    if (outputTab === "Refine") return refinedText || transcript;
    if (outputTab === "AI Prompt") return promptText || transcript;
    return transcript;
  };

  // Prevent hydration mismatch for theme
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 font-sans flex flex-col overflow-x-hidden">
      {/* Header */}
      <nav className="h-16 px-4 md:px-8 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
            <Mic size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              Bangla Voice <span className="text-indigo-600 dark:text-indigo-400">Hub</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 bg-slate-100 dark:bg-zinc-800 rounded-full text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          
          {mounted && (
            <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-full items-center">
              <button
                onClick={() => setTheme("light")}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${theme !== 'dark' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-800 dark:text-zinc-100' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${theme === 'dark' ? 'bg-white dark:bg-zinc-700 shadow-sm text-slate-800 dark:text-zinc-100' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Dark
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-1 p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
        {/* Sidebar Controls */}
        <aside className="col-span-1 lg:col-span-3 flex flex-col gap-4">
          <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
            <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-2xl mb-4 relative">
              {(["Voice", "Upload"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMainTab(tab)}
                  className={`flex-1 flex items-center justify-center py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors z-10 relative ${
                    mainTab === tab ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                  }`}
                >
                  {tab}
                  {mainTab === tab && (
                    <motion.div
                      layoutId="mainTabIndicator"
                      className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-xl shadow-sm -z-10"
                    />
                  )}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {mainTab === "Voice" ? (
                <motion.div key="voice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2 mt-2">Language Settings</h2>
                  <div className="space-y-2">
                    <button
                      onClick={() => setVoiceLang("bn-BD")}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-colors ${
                        voiceLang === "bn-BD" ? "bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50" : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🇧🇩</span>
                        <span className={`font-semibold ${voiceLang === 'bn-BD' ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-500 dark:text-zinc-400'}`}>Bangla</span>
                      </div>
                      {voiceLang === "bn-BD" && <div className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-500"></div>}
                    </button>
                    <button
                      onClick={() => setVoiceLang("en-US")}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-colors ${
                        voiceLang === "en-US" ? "bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50" : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🇺🇸</span>
                        <span className={`font-semibold ${voiceLang === 'en-US' ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-500 dark:text-zinc-400'}`}>English</span>
                      </div>
                      {voiceLang === "en-US" && <div className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-500"></div>}
                    </button>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800">
                     <div className="flex items-center justify-between">
                       <span className="text-sm font-semibold text-slate-600 dark:text-zinc-400">Auto Translation</span>
                       <button
                         onClick={() => setAutoTranslate(!autoTranslate)}
                         className={`w-10 h-5 rounded-full flex items-center px-1 transition-colors ${autoTranslate ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-zinc-700'}`}
                       >
                         <div className={`w-3 h-3 bg-white rounded-full transition-transform ${autoTranslate ? 'translate-x-5' : 'translate-x-0'}`}></div>
                       </button>
                     </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                  <h2 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2 mt-2">Audio Processing</h2>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 dark:border-zinc-700 rounded-2xl cursor-pointer hover:bg-indigo-50 dark:hover:bg-zinc-800/50 hover:border-indigo-300 dark:hover:border-indigo-400/50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-500 dark:text-zinc-400">
                      <Upload className="w-8 h-8 mb-3" />
                      <p className="text-sm font-medium"><span className="font-semibold text-slate-700 dark:text-zinc-300">Click to upload</span> MP3/WAV File</p>
                    </div>
                    <input id="dropzone-file" type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {audioFile && (
                    <div className="flex flex-col gap-2">
                       <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-800/80 rounded-xl border border-slate-200 dark:border-zinc-700">
                         <p className="text-sm truncate text-slate-700 dark:text-zinc-300 ml-2">{audioFile.name}</p>
                       </div>
                       <button
                         onClick={processAudioFile}
                         disabled={isTranscribing}
                         className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-sm font-medium transition"
                       >
                         {isTranscribing ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} />}
                         {isTranscribing ? "Transcribing..." : "Transcribe"}
                       </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {mainTab === "Voice" && (
            <button
              onClick={toggleRecording}
              className={`p-6 rounded-3xl text-white shadow-xl flex flex-col items-center justify-center text-center gap-3 transition-colors relative overflow-hidden ${
                isRecording ? "bg-red-500 shadow-red-200 dark:shadow-none" : "bg-indigo-600 shadow-indigo-200 dark:shadow-none hover:bg-indigo-700"
              }`}
            >
              {isRecording && (
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent animate-pulse delay-100" />
              )}
              <div className={`w-16 h-16 ${isRecording ? "bg-white/30 ring-4 ring-white/50 animate-pulse duration-1000 scale-110" : "bg-white/20"} rounded-full flex items-center justify-center transition-all duration-500 z-10`}>
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-inner relative">
                  {isRecording ? (
                    <StopCircle className="w-6 h-6 text-red-500 scale-90" />
                  ) : (
                    <Mic className="w-6 h-6 text-indigo-600" />
                  )}
                </div>
              </div>
              <p className="font-bold text-lg font-sans z-10">{isRecording ? "Listening..." : "Tap to Speak"}</p>
              <p className={`text-xs font-semibold z-10 ${isRecording ? "text-red-100" : "text-indigo-100"}`}>
                {isRecording ? "Recording active" : "Ready to dictate"}
              </p>
            </button>
          )}
        </aside>

        {/* Main Workspace */}
        <div className="col-span-1 lg:col-span-9 flex flex-col gap-6 font-bangla">
          <div className="flex-1 min-h-[400px] bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-sm flex flex-col">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
              <div className="flex gap-2 p-1 bg-slate-100 dark:bg-zinc-800 rounded-2xl overflow-x-auto hide-scrollbar">
                {(["Original", "Refine", "AI Prompt"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setOutputTab(tab)}
                    className={`px-4 sm:px-6 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors relative ${
                      outputTab === tab ? "bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                 <button
                   onClick={() => handleCopy(getActiveText())}
                   disabled={!getActiveText() || isProcessing}
                   title="Copy text"
                   className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 transition-colors"
                 >
                   {copying ? <Check size={20} className="text-green-500" /> : <Copy size={20} />}
                 </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 flex-1 flex flex-col relative">
              {outputTab === "AI Prompt" && (
                <div className="mb-6 flex gap-2 font-sans">
                  <select
                    value={promptTarget}
                    onChange={(e) => {
                       setPromptTarget(e.target.value as any);
                       setPromptText(""); // Reset
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-sm font-bold border border-indigo-100 dark:border-indigo-800/50 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 block"
                  >
                    <option value="ChatGPT">ChatGPT Prompt</option>
                    <option value="Image">Image Gen Prompt</option>
                    <option value="Video">Video Gen Prompt</option>
                  </select>
                </div>
              )}

              <div className="flex-1 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {isProcessing ? (
                    <motion.div 
                      key="processing"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex items-center justify-center text-indigo-500 space-y-2 flex-col font-sans"
                    >
                       <RefreshCw className="animate-spin w-8 h-8" />
                       <span className="text-sm font-semibold animate-pulse">Processing...</span>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key={`content-${outputTab}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="h-full"
                    >
                      <p className="text-xl sm:text-2xl text-slate-800 dark:text-zinc-200 leading-relaxed font-medium whitespace-pre-wrap">
                        {getActiveText() || <span className="text-slate-400 dark:text-zinc-500 italic font-normal text-lg font-sans">Your transcribed text will appear here...</span>}
                        {isRecording && getActiveText() && (
                          <span className="text-indigo-400 inline-block w-1.5 h-6 bg-indigo-400 animate-pulse ml-1 align-middle"></span>
                        )}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {/* English Translation inline if any */}
              {translation && (
                <div className="mt-8 pt-8 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-4 font-sans">
                    <h3 className="text-xs font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Translation ({translateTarget})</h3>
                    <button onClick={() => handleCopy(translation)} className="text-slate-400 hover:text-indigo-600 transition-colors"><Copy size={16}/></button>
                  </div>
                  <p className="text-lg sm:text-xl text-slate-600 dark:text-zinc-400 italic leading-relaxed">
                    {translation}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* AI & Vocab Footer */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[16rem]">
            {/* Translate Controls & Vocabulary Block */}
            <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl p-5 border border-emerald-100 dark:border-emerald-900/30 flex flex-col">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2 font-sans">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">📚</span>
                  <h3 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Vocabulary Focus</h3>
                </div>
                
                <div className="flex items-center gap-2">
                  <select
                    value={translateTarget}
                    onChange={(e) => setTranslateTarget(e.target.value as any)}
                    className="px-2 py-1 bg-white dark:bg-zinc-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold text-emerald-800 dark:text-emerald-300 outline-none"
                  >
                    <option value="English">To English</option>
                    <option value="Bangla">To Bangla</option>
                  </select>
                  <button
                     onClick={() => doTranslate()}
                     disabled={isTranslating || isProcessing || !transcript}
                     className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1"
                  >
                     {isTranslating ? <RefreshCw className="animate-spin" size={14} /> : "Translate"}
                  </button>
                </div>
              </div>
              
              <div className="flex-1">
                {vocab && vocab.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {vocab.map((v, i) => (
                      <div key={i} className="bg-white dark:bg-zinc-800 px-3 py-2 rounded-xl border border-emerald-100 dark:border-emerald-800/50 flex flex-col justify-center">
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{v.word}</span>
                        <span className="text-xs text-slate-500 dark:text-zinc-400">{v.meaning}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-emerald-600/50 dark:text-emerald-400/50 italic font-sans">
                    Tap Translate to extract key words.
                  </div>
                )}
              </div>
            </div>

            {/* AI Refinement Box */}
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-3xl p-5 border border-amber-100 dark:border-amber-900/30 flex flex-col">
              <div className="flex items-center gap-2 mb-3 font-sans">
                <span className="text-amber-500">✨</span>
                <h3 className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">AI Hub Tips</h3>
              </div>
              <p className="text-sm text-amber-900 dark:text-amber-200/80 font-medium leading-relaxed mb-4 flex-1 font-sans">
                Use the <span className="font-bold text-amber-700 dark:text-amber-300">Refine</span> tab to automatically remove filler words and fix grammar from your dictated speech. Or switch to <span className="font-bold text-amber-700 dark:text-amber-300">AI Prompt Mode</span> to quickly generate ChatGPT or Midjourney instructions.
              </p>
              <div className="font-sans">
                <button
                  onClick={() => setOutputTab("Refine")}
                  disabled={!transcript}
                  className="mt-auto text-xs font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-amber-900/50 px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 shadow-sm hover:shadow transition disabled:opacity-50"
                >
                  Quick Refine
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Global CSS for slow pulse and scrollbar hiding */}
      <style dangerouslySetInnerHTML={{__html: `
        .animate-pulse-slow {
          animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
      
      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-md p-6 sm:p-8 shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                   <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                   <h2 className="text-xl font-bold text-slate-800 dark:text-zinc-100">API Settings</h2>
                   <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400">Configure your connection</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-zinc-300 mb-2">Google Gemini API Key</label>
                  <input
                    type="text"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-zinc-200 transition-colors"
                  />
                  <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">
                    If empty, the app will try to use the system default key. Your key is only used locally.
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                Save & Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
