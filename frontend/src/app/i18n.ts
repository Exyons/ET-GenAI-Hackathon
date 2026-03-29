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
  | "error_backend"
  | "tab_chat"
  | "tab_drone"
  | "drone_title"
  | "drone_start"
  | "drone_scanning"
  | "drone_complete"
  | "drone_healthy"
  | "drone_warning"
  | "drone_critical"
  | "drone_zone"
  | "drone_battery"
  | "drone_waypoint"
  | "drone_altitude"
  | "drone_spray_plan"
  | "drone_no_issues"
  | "drone_field_area"
  | "chat_history"
  | "new_chat"
  | "delete_chat"
  | "drone_reset";

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
    tab_chat: "Chat",
    tab_drone: "Drone Survey",
    drone_title: "Drone Field Survey",
    drone_start: "Start Survey",
    drone_scanning: "Scanning field...",
    drone_complete: "Survey Complete",
    drone_healthy: "Healthy",
    drone_warning: "Warning",
    drone_critical: "Critical",
    drone_zone: "Zone",
    drone_battery: "Battery",
    drone_waypoint: "Waypoint",
    drone_altitude: "Altitude",
    drone_spray_plan: "Generate Spray Plan",
    drone_no_issues: "No issues detected - field is healthy!",
    drone_field_area: "Field Area",
    chat_history: "Chat History",
    new_chat: "New Chat",
    delete_chat: "Delete chat",
    drone_reset: "Reset",
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
    tab_chat: "चैट",
    tab_drone: "ड्रोन सर्वेक्षण",
    drone_title: "ड्रोन खेत सर्वेक्षण",
    drone_start: "सर्वेक्षण शुरू करें",
    drone_scanning: "खेत स्कैन हो रहा है...",
    drone_complete: "सर्वेक्षण पूरा",
    drone_healthy: "स्वस्थ",
    drone_warning: "चेतावनी",
    drone_critical: "गंभीर",
    drone_zone: "क्षेत्र",
    drone_battery: "बैटरी",
    drone_waypoint: "वेपॉइंट",
    drone_altitude: "ऊंचाई",
    drone_spray_plan: "स्प्रे योजना बनाएं",
    drone_no_issues: "कोई समस्या नहीं - खेत स्वस्थ है!",
    drone_field_area: "खेत का क्षेत्रफल",
    chat_history: "चैट इतिहास",
    new_chat: "नई चैट",
    delete_chat: "चैट हटाएं",
    drone_reset: "रीसेट",
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
    tab_chat: "चॅट",
    tab_drone: "ड्रोन सर्वेक्षण",
    drone_title: "ड्रोन शेत सर्वेक्षण",
    drone_start: "सर्वेक्षण सुरू करा",
    drone_scanning: "शेत स्कॅन होत आहे...",
    drone_complete: "सर्वेक्षण पूर्ण",
    drone_healthy: "निरोगी",
    drone_warning: "इशारा",
    drone_critical: "गंभीर",
    drone_zone: "क्षेत्र",
    drone_battery: "बॅटरी",
    drone_waypoint: "वेपॉइंट",
    drone_altitude: "उंची",
    drone_spray_plan: "फवारणी योजना तयार करा",
    drone_no_issues: "कोणतीही समस्या नाही - शेत निरोगी आहे!",
    drone_field_area: "शेताचे क्षेत्रफळ",
    chat_history: "चॅट इतिहास",
    new_chat: "नवीन चॅट",
    delete_chat: "चॅट हटवा",
    drone_reset: "रीसेट",
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
    tab_chat: "చాట్",
    tab_drone: "డ్రోన్ సర్వే",
    drone_title: "డ్రోన్ పొలం సర్వే",
    drone_start: "సర్వే ప్రారంభించండి",
    drone_scanning: "పొలం స్కాన్ అవుతోంది...",
    drone_complete: "సర్వే పూర్తయింది",
    drone_healthy: "ఆరోగ్యకరం",
    drone_warning: "హెచ్చరిక",
    drone_critical: "క్రిటికల్",
    drone_zone: "జోన్",
    drone_battery: "బ్యాటరీ",
    drone_waypoint: "వేపాయింట్",
    drone_altitude: "ఎత్తు",
    drone_spray_plan: "స్ప్రే ప్లాన్ తయారు చేయండి",
    drone_no_issues: "సమస్యలు లేవు - పొలం ఆరోగ్యంగా ఉంది!",
    drone_field_area: "పొలం విస్తీర్ణం",
    chat_history: "చాట్ చరిత్ర",
    new_chat: "కొత్త చాట్",
    delete_chat: "చాట్ తొలగించు",
    drone_reset: "రీసెట్",
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
