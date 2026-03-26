/** Multi-language UI strings for Kisan AI */

export type LangKey =
  | "title"
  | "language_label"
  | "placeholder"
  | "placeholder_empty"
  | "ask_button"
  | "insights_button"
  | "hide_button"
  | "listen_button"
  | "stop_button"
  | "recording"
  | "attach_image"
  | "hold_to_record"
  | "you"
  | "kisan_ai"
  | "model_insights"
  | "thinking"
  | "english_response"
  | "translation_input"
  | "translation_output"
  | "intent"
  | "image_validation"
  | "vision_analysis"
  | "rag_context"
  | "generation"
  | "tts_audio"
  | "total_pipeline"
  | "agricultural"
  | "rejected"
  | "farm_image"
  | "not_farm"
  | "skipped_english"
  | "error_backend";

const strings: Record<string, Record<LangKey, string>> = {
  "en-IN": {
    title: "Kisan AI - Agricultural Advisor",
    language_label: "Preferred Language:",
    placeholder: "Type or hold mic to speak...",
    placeholder_empty: "Ask a question about your crops or farming practices...",
    ask_button: "Ask",
    insights_button: "Insights",
    hide_button: "Hide",
    listen_button: "Listen",
    stop_button: "Stop",
    recording: "Recording...",
    attach_image: "Attach Image",
    hold_to_record: "Hold to record",
    you: "You",
    kisan_ai: "Kisan AI",
    model_insights: "Model Insights",
    thinking: "Thinking...",
    english_response: "English response",
    translation_input: "Translation (Input)",
    translation_output: "Translation (Output)",
    intent: "Intent",
    image_validation: "Image Validation",
    vision_analysis: "Vision Analysis",
    rag_context: "RAG Context",
    generation: "Generation",
    tts_audio: "TTS Audio",
    total_pipeline: "Total Pipeline",
    agricultural: "AGRICULTURAL",
    rejected: "REJECTED",
    farm_image: "FARM IMAGE",
    not_farm: "NOT FARM",
    skipped_english: "skipped (already English)",
    error_backend: "Error connecting to the backend.",
  },
  "hi-IN": {
    title: "किसान AI - कृषि सलाहकार",
    language_label: "पसंदीदा भाषा:",
    placeholder: "टाइप करें या माइक दबाकर बोलें...",
    placeholder_empty: "अपनी फसलों या खेती के बारे में सवाल पूछें...",
    ask_button: "पूछें",
    insights_button: "जानकारी",
    hide_button: "छुपाएं",
    listen_button: "सुनें",
    stop_button: "रुकें",
    recording: "रिकॉर्डिंग...",
    attach_image: "फोटो जोड़ें",
    hold_to_record: "रिकॉर्ड करने के लिए दबाएं",
    you: "आप",
    kisan_ai: "किसान AI",
    model_insights: "मॉडल विवरण",
    thinking: "सोच रहा है...",
    english_response: "अंग्रेजी उत्तर",
    translation_input: "अनुवाद (इनपुट)",
    translation_output: "अनुवाद (आउटपुट)",
    intent: "इरादा",
    image_validation: "छवि सत्यापन",
    vision_analysis: "दृष्टि विश्लेषण",
    rag_context: "RAG संदर्भ",
    generation: "उत्पादन",
    tts_audio: "TTS ऑडियो",
    total_pipeline: "कुल पाइपलाइन",
    agricultural: "कृषि",
    rejected: "अस्वीकृत",
    farm_image: "खेत की छवि",
    not_farm: "खेत नहीं",
    skipped_english: "छोड़ा गया (पहले से अंग्रेजी)",
    error_backend: "बैकएंड से कनेक्ट करने में त्रुटि।",
  },
  "mr-IN": {
    title: "किसान AI - कृषी सल्लागार",
    language_label: "पसंतीची भाषा:",
    placeholder: "टाइप करा किंवा माइक धरून बोला...",
    placeholder_empty: "तुमच्या पिकांबद्दल किंवा शेतीबद्दल प्रश्न विचारा...",
    ask_button: "विचारा",
    insights_button: "माहिती",
    hide_button: "लपवा",
    listen_button: "ऐका",
    stop_button: "थांबा",
    recording: "रेकॉर्डिंग...",
    attach_image: "फोटो जोडा",
    hold_to_record: "रेकॉर्ड करण्यासाठी दाबा",
    you: "तुम्ही",
    kisan_ai: "किसान AI",
    model_insights: "मॉडेल माहिती",
    thinking: "विचार करत आहे...",
    english_response: "इंग्रजी उत्तर",
    translation_input: "भाषांतर (इनपुट)",
    translation_output: "भाषांतर (आउटपुट)",
    intent: "हेतू",
    image_validation: "प्रतिमा सत्यापन",
    vision_analysis: "दृष्टी विश्लेषण",
    rag_context: "RAG संदर्भ",
    generation: "निर्मिती",
    tts_audio: "TTS ऑडिओ",
    total_pipeline: "एकूण पाइपलाइन",
    agricultural: "कृषी",
    rejected: "नाकारले",
    farm_image: "शेतीची प्रतिमा",
    not_farm: "शेत नाही",
    skipped_english: "वगळले (आधीच इंग्रजी)",
    error_backend: "बॅकएंडशी कनेक्ट करण्यात त्रुटी.",
  },
  "te-IN": {
    title: "కిసాన్ AI - వ్యవసాయ సలహాదారు",
    language_label: "ఇష్టమైన భాష:",
    placeholder: "టైప్ చేయండి లేదా మైక్ నొక్కి మాట్లాడండి...",
    placeholder_empty: "మీ పంటలు లేదా వ్యవసాయ పద్ధతుల గురించి ప్రశ్న అడగండి...",
    ask_button: "అడగండి",
    insights_button: "వివరాలు",
    hide_button: "దాచు",
    listen_button: "వినండి",
    stop_button: "ఆపండి",
    recording: "రికార్డింగ్...",
    attach_image: "ఫోటో జోడించండి",
    hold_to_record: "రికార్డ్ చేయడానికి నొక్కండి",
    you: "మీరు",
    kisan_ai: "కిసాన్ AI",
    model_insights: "మోడల్ వివరాలు",
    thinking: "ఆలోచిస్తోంది...",
    english_response: "ఆంగ్ల సమాధానం",
    translation_input: "అనువాదం (ఇన్‌పుట్)",
    translation_output: "అనువాదం (అవుట్‌పుట్)",
    intent: "ఉద్దేశం",
    image_validation: "చిత్ర ధృవీకరణ",
    vision_analysis: "దృష్టి విశ్లేషణ",
    rag_context: "RAG సందర్భం",
    generation: "ఉత్పత్తి",
    tts_audio: "TTS ఆడియో",
    total_pipeline: "మొత్తం పైప్‌లైన్",
    agricultural: "వ్యవసాయం",
    rejected: "తిరస్కరించబడింది",
    farm_image: "పొలం చిత్రం",
    not_farm: "పొలం కాదు",
    skipped_english: "దాటవేయబడింది (ఇప్పటికే ఆంగ్లం)",
    error_backend: "బ్యాకెండ్‌కు కనెక్ట్ చేయడంలో లోపం.",
  },
};

export function t(lang: string, key: LangKey): string {
  return strings[lang]?.[key] ?? strings["en-IN"][key] ?? key;
}

export const loadingPhrases: Record<string, string[]> = {
  "en-IN": ["Analyzing soil data...", "Consulting KVK guidelines...", "Checking weather patterns...", "Sowing seeds of thought..."],
  "hi-IN": ["मिट्टी का विश्लेषण...", "KVK दिशा-निर्देश देख रहे हैं...", "मौसम की जांच...", "विचारों के बीज बो रहे हैं..."],
  "mr-IN": ["मातीचे विश्लेषण...", "KVK मार्गदर्शक तत्त्वे...", "हवामान तपासत आहे...", "विचारांचे बीज पेरत आहे..."],
  "te-IN": ["మట్టి విశ్లేషణ...", "KVK మార్గదర్శకాలు...", "వాతావరణం తనిఖీ...", "ఆలోచనల విత్తనాలు నాటుతున్నాము..."],
};
