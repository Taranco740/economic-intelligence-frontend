"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { languageNames, translations, type Language, type Translation } from "../../lib/i18n";

type LanguageContextValue={language:Language;setLanguage:(language:Language)=>void;t:Translation;languages:typeof languageNames};
const LanguageContext=createContext<LanguageContextValue|null>(null);

export function LanguageProvider({children}:{children:React.ReactNode}){
 const [language,setLanguage]=useState<Language>("en");
 useEffect(()=>{const saved=window.localStorage.getItem("gamuur-language") as Language|null;if(saved&&saved in translations)setLanguage(saved)},[]);
 useEffect(()=>{window.localStorage.setItem("gamuur-language",language);document.documentElement.lang=language;document.documentElement.dir=language==="ar"?"rtl":"ltr"},[language]);
 const value=useMemo(()=>({language,setLanguage,t:translations[language],languages:languageNames}),[language]);
 return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){const value=useContext(LanguageContext);if(!value)throw new Error("useLanguage must be used inside LanguageProvider");return value;}
