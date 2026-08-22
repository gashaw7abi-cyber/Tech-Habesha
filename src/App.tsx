import { motion } from "motion/react";
import { 
  Code, 
  Newspaper, 
  Users, 
  Terminal, 
  Globe, 
  ChevronRight, 
  Twitter, 
  Menu,
  X,
  Loader2,
  LogOut,
  PlusCircle,
  Image as ImageIcon,
  Trash2,
  Youtube,
  Facebook,
  Send,
  Video,
  Share2,
  Check,
  Download,
  ExternalLink,
  Mail
} from "lucide-react";
import React, { useState, useEffect } from "react";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { collection, addDoc, serverTimestamp, getDocs, orderBy, limit, query, doc, setDoc, increment, getDoc, deleteDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";
import { techLogo } from "./logo";

interface NewsItem {
  id: string | number;
  title: string;
  source: string;
  date: string;
  content: string;
  link: string;
  imageUrl?: string;
  metaDescription?: string;
}

const shareContent = async (title: string, content?: string, imageUrl?: string) => {
  const urlToShare = "https://techhabesha.com.et";
  
  const contentText = content ? content.split('\n').slice(0, 12).join('\n') + '\n\n' : '';
  const shareText = `${title}\n\n${contentText}Download Tech Habesha App: https://www.techhabesha.com.et/`;

  if (navigator.share) {
    let shareData: any = {
      title: title,
      text: shareText,
      url: urlToShare,
    };

    let sharedAsFile = false;
    if (imageUrl) {
      try {
        const controller = new AbortController();
        // Allow slightly more time (2.5s max) to fetch the image to prevent user gesture timeout
        const timeoutId = setTimeout(() => controller.abort(), 2500); 
        
        // Try direct fetch first (works for postimg and CORS-enabled hosts)
        let response = await fetch(imageUrl, { signal: controller.signal }).catch(() => null);
        
        // Fallback to allorigins proxy if direct fetch fails (wsrv.nl blocks some domains)
        if (!response || !response.ok) {
          const proxiedUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`;
          response = await fetch(proxiedUrl, { signal: controller.signal });
        }
        
        clearTimeout(timeoutId);
        
        if (response && response.ok) {
          const blob = await response.blob();
          let mimeType = blob.type;
          if (!mimeType || mimeType === 'application/octet-stream') {
            mimeType = 'image/jpeg';
          }
          const ext = mimeType.split('/')[1] || 'jpg';
          const file = new File([blob], `photo.${ext}`, { type: mimeType });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            shareData.files = [file];
            // Remove the top-level URL to force native share sheets (especially Android) to share the file,
            // otherwise they often create a link preview and ignore the image completely.
            // The URL is already included in the `shareText`.
            delete shareData.url;
            sharedAsFile = true;
          }
        }
      } catch (e) {
        // Failed to fetch or timed out, we skip file attachment and just use text
      }
    }

    try {
      await navigator.share(shareData);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Failed to share: ", err);
        // If it failed (e.g. user gesture expired because fetch took just enough time),
        // we can't do much with navigator.share anymore on this click. 
        // But we tried to limit the fetch to 1.2s to prevent this.
      }
    }
  } else {
    // Fallback to Telegram share
    window.open(`https://t.me/share/url?url=${encodeURIComponent(urlToShare)}&text=${encodeURIComponent(shareText)}`, '_blank');
  }
};

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      (window as any).adsbygoogle = (window as any).adsbygoogle || [];
      // (window as any).adsbygoogle.push({});
    } catch (e) {
      console.error("AdSense error", e);
    }
  }, []);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showAboutUs, setShowAboutUs] = useState(false);
  const [showContactUs, setShowContactUs] = useState(false);
  const [showAppPromo, setShowAppPromo] = useState(false);
  const isAdmin = user?.email?.toLowerCase() === "gashaw7abi@gmail.com";
  const [visits, setVisits] = useState<number | null>(null);
  const [dailyVisits, setDailyVisits] = useState<number | null>(null);

  const handleModalShare = async () => {
    if (!selectedNews) return;
    await shareContent(selectedNews.title, selectedNews.content, selectedNews.imageUrl);
  };

  useEffect(() => {
    if (selectedNews) {
      document.title = `${selectedNews.title} | Tech Habesha`;
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', selectedNews.metaDescription || selectedNews.content.slice(0, 155) + '...');
      }
    } else {
      document.title = "Tech Habesha";
      let metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', "Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.");
      }
    }
  }, [selectedNews]);

  useEffect(() => {
    // Handle hash links for AdSense crawlers/direct links
    if (window.location.hash === '#privacy-policy' || window.location.hash === '#privacy') {
      setShowPrivacyPolicy(true);
    }
    if (window.location.hash === '#terms' || window.location.hash === '#tos') {
      setShowTermsOfService(true);
    }
    if (window.location.hash === '#about') {
      setShowAboutUs(true);
    }
    if (window.location.hash === '#contact') {
      setShowContactUs(true);
    }
  }, []);

  useEffect(() => {
    const hasDismissed = sessionStorage.getItem('appPromoDismissed');
    if (!hasDismissed) {
      setShowAppPromo(true);
    }
  }, []);

  const dismissPromo = () => {
    setShowAppPromo(false);
    sessionStorage.setItem('appPromoDismissed', 'true');
  };

  useEffect(() => {
    // Record visit
    const recordVisit = async () => {
      const todayDate = new Date().toISOString().split('T')[0];
      const lastVisitDate = localStorage.getItem('lastVisitDate');
      const hasVisitedBefore = localStorage.getItem('hasVisited');

      try {
        if (!hasVisitedBefore) {
          await setDoc(doc(db, "stats", "visits"), {
            count: increment(1)
          }, { merge: true });
          localStorage.setItem('hasVisited', 'true');
        }

        if (lastVisitDate !== todayDate) {
          // Increment daily visit
          await setDoc(doc(db, "stats", `daily_visits_${todayDate}`), {
            count: increment(1)
          }, { merge: true });
          localStorage.setItem('lastVisitDate', todayDate);
        }
      } catch (error) {
        console.error("Failed to record visit:", error);
      }
    };
    recordVisit();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      const fetchVisits = async () => {
        try {
          const docSnap = await getDoc(doc(db, "stats", "visits"));
          if (docSnap.exists()) {
            setVisits(docSnap.data().count);
          }

          const todayDate = new Date().toISOString().split('T')[0];
          const dailyDocSnap = await getDoc(doc(db, "stats", `daily_visits_${todayDate}`));
          if (dailyDocSnap.exists()) {
            setDailyVisits(dailyDocSnap.data().count);
          } else {
            setDailyVisits(0);
          }
        } catch (error) {
          console.warn("Failed to fetch visits:", error);
        }
      }
      fetchVisits();
    }
  }, [isAdmin]);

  const handleDeleteNews = async (id: string, source: string) => {
    if (!isAdmin) return;
    const isRss = source === "Hacker News" || source === "TechCrunch" || source === "The Verge" || source === "Engadget";
    if (isRss) {
      // In a real app we'd show a toast, but alert is blocked in iframe
      console.warn("You cannot delete imported RSS feed news.");
      return;
    }
    
    try {
      await deleteDoc(doc(db, "custom_news", id));
      setSelectedNews(null);
      fetchUpdatedNews();
    } catch (error) {
      console.error("Error deleting news:", error);
    }
  };

  const fetchClientSideNews = async (): Promise<NewsItem[]> => {
    let combined: NewsItem[] = [];
    
    // 1. Hacker News
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const hnRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (hnRes.ok) {
        const topIds = await hnRes.json();
        const storyPromises = topIds.slice(0, 30).map((id: number) => {
          const itemController = new AbortController();
          const itemTimeout = setTimeout(() => itemController.abort(), 8000);
          return fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: itemController.signal })
            .then(r => r.json())
            .finally(() => clearTimeout(itemTimeout));
        });
        const stories = await Promise.all(storyPromises);
        const hnNews = stories.filter(Boolean).map((story: any) => ({
          id: story.id,
          title: story.title,
          source: "Hacker News",
          date: new Date(story.time * 1000).toISOString(),
          content: "",
          link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          imageUrl: undefined
        }));
        combined = combined.concat(hnNews);
      }
    } catch (e) { console.warn("HN fetch failed:", e); }

    // 2. RSS via public rss2json API
    const rssFeeds = [
      "https://techcrunch.com/category/gadgets/feed/",
      "https://www.theverge.com/rss/index.xml"
    ];

    for (const feed of rssFeeds) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'ok' && data.items) {
            const feedNews = data.items.map((item: any) => ({
              id: item.guid || Math.random().toString(),
              title: item.title,
              source: data.feed.title || "Tech Source",
              date: item.pubDate || new Date().toISOString(),
              content: item.description?.replace(/<[^>]+>/g, '').trim(),
              link: item.link,
              imageUrl: item.thumbnail || item.enclosure?.link || undefined
            }));
            combined = combined.concat(feedNews);
          }
        }
      } catch (e) { console.warn("RSS fetch failed:", e); }
    }
    
    return combined;
  };

  const fetchUpdatedNews = async () => {
    setLoadingNews(true);
    try {
      // First try to resolve firestore query with a 5 second timeout
      let firestoreRes;
      try {
        const firestorePromise = getDocs(query(collection(db, "custom_news"), orderBy("date", "desc"), limit(50)));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 5000));
        firestoreRes = await Promise.race([firestorePromise, timeoutPromise]) as any;
      } catch (err) {
        console.warn("Firestore fetch error or timeout:", err);
      }

      let allNews: NewsItem[] = [];

      if (firestoreRes && firestoreRes.docs) {
        const customNews = firestoreRes.docs.map((doc: any) => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            source: data.source || "Tech Habesha",
            date: data.date?.toDate?.()?.toISOString() || new Date().toISOString(),
            content: data.content,
            link: data.link || "",
            imageUrl: data.imageUrl || undefined
          };
        });
        allNews = allNews.concat(customNews);
      }

      // Try fetching from our backend API, fallback to client side
      let apiNews: NewsItem[] = [];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const beRes = await fetch("/api/news", { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (beRes.ok) {
          apiNews = await beRes.json();
        } else {
          apiNews = await fetchClientSideNews();
        }
      } catch (err) {
        console.warn("Backend fetch failed, falling back to client-side:", err);
        apiNews = await fetchClientSideNews();
      }

      if (Array.isArray(apiNews) && apiNews.length > 0) {
        allNews = allNews.concat(apiNews);
      }

      allNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setNews(allNews);
    } catch (error) {
      console.error("Failed to fetch news:", error);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    fetchUpdatedNews();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30">
      {/* App Promo Banner */}
      {showAppPromo && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-[#0f1523] border-b border-slate-800 px-3 py-2 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={dismissPromo}
              className="p-1 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-slate-700">
              <img src={techLogo} alt="Tech Habesha" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-100 text-[15px] leading-tight">Tech Habesha</span>
              <div className="flex text-emerald-500 text-[10px] mt-0.5">
                {'★'.repeat(5)}
              </div>
            </div>
          </div>
          <a 
            href="https://www.dropbox.com/scl/fi/5837no93zibig0dobfd0f/app.apk?rlkey=to61dxjsmt18elbhcdzej43nq&st=hz8b1bjg&dl=1" 
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg transition-colors"
            onClick={dismissPromo}
          >
            DOWNLOAD
            <Download className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* Navigation */}
      <nav className={`fixed w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 transition-all duration-300 ${showAppPromo ? 'top-[56px]' : 'top-0'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src={techLogo} alt="Tech Habesha Logo" className="w-10 h-10 rounded-full object-cover border border-slate-800" />
              <span className="font-bold text-xl tracking-tight">TECH <span className="text-emerald-500">HABESHA</span></span>
            </div>
            
            <div className="hidden md:flex space-x-8">
              <a href="#about" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors">About</a>
              <a href="#services" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors">Services</a>
              <a href="#news" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors">News</a>
              <a href="#community" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors">Community</a>
              <a href="#contact" className="text-sm font-medium text-slate-300 hover:text-emerald-400 transition-colors">Contact</a>
            </div>

            <div className="hidden md:flex items-center gap-4">
              {isAdmin && (
                <>
                  <div className="text-slate-400 text-sm flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                    <div className="flex items-center gap-1.5" title="Total Visits">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {visits !== null ? visits : '...'} Total
                    </div>
                    <div className="w-px h-3 bg-slate-700"></div>
                    <div className="flex items-center gap-1.5" title="Today's Visits">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                      {dailyVisits !== null ? dailyVisits : '...'} Today
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowAdminModal(true)}
                    className="bg-slate-800 hover:bg-slate-700 text-emerald-400 px-4 py-2 rounded-full font-medium transition-colors flex items-center gap-2 text-sm border border-slate-700"
                  >
                    <PlusCircle className="w-4 h-4" /> Post News
                  </button>
                </>
              )}
              {user ? (
                <button 
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-rose-400 flex items-center gap-2 text-sm transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="text-slate-400 hover:text-emerald-400 text-sm font-medium transition-colors cursor-pointer"
                >
                  Admin Login
                </button>
              )}
            </div>

            <div className="flex md:hidden items-center justify-end flex-shrink-0 z-[60] ml-auto">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                className="text-slate-200 hover:text-white p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 cursor-pointer transition-all active:scale-95"
                aria-label="Toggle menu"
              >
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800">
            <div className="px-4 py-4 space-y-4">
              <a href="#about" className="block text-sm font-medium text-slate-300 hover:text-emerald-400">About</a>
              <a href="#services" className="block text-sm font-medium text-slate-300 hover:text-emerald-400">Services</a>
              <a href="#news" className="block text-sm font-medium text-slate-300 hover:text-emerald-400">News</a>
              <a href="#community" className="block text-sm font-medium text-slate-300 hover:text-emerald-400">Community</a>
              <a href="#contact" className="block text-sm font-medium text-slate-300 hover:text-emerald-400">Contact</a>
              
              <div className="pt-4 border-t border-slate-800 mt-4">
                {isAdmin && (
                  <>
                    <div className="flex justify-center mb-3">
                      <div className="text-slate-400 text-sm flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          {visits !== null ? visits : '...'} Total
                        </div>
                        <div className="w-px h-3 bg-slate-700"></div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                          {dailyVisits !== null ? dailyVisits : '...'} Today
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => { setShowAdminModal(true); setIsMenuOpen(false); }}
                      className="w-full bg-slate-800 text-emerald-400 px-5 py-2 rounded-md font-medium cursor-pointer mb-3 flex justify-center items-center gap-2 border border-slate-700"
                    >
                      <PlusCircle className="w-4 h-4" /> Post News
                    </button>
                  </>
                )}
                <a href="https://t.me/TechHabeshas" target="_blank" rel="noopener noreferrer" className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white px-5 py-2 rounded-md font-medium cursor-pointer mb-3 flex items-center justify-center gap-2 transition-colors">
                  <Send className="w-4 h-4" /> Join Telegram
                </a>
                <a href="https://www.dropbox.com/scl/fi/5837no93zibig0dobfd0f/app.apk?rlkey=to61dxjsmt18elbhcdzej43nq&st=hz8b1bjg&dl=1" className="w-full bg-emerald-500 text-slate-950 px-5 py-2 rounded-md font-medium cursor-pointer mb-3 flex items-center justify-center gap-2 transition-colors">
                  <Download className="w-4 h-4" /> Download App
                </a>
                {user ? (
                   <button onClick={handleLogout} className="w-full text-center text-slate-400 py-2">Logout</button>
                ) : (
                   <button onClick={handleLogin} className="w-full text-center text-slate-400 py-2">Admin Login</button>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className={`transition-all duration-300 ${showAppPromo ? 'pt-[130px]' : 'pt-24'} pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col items-center text-center`}>
        <motion.div
          initial="initial"
          animate="animate"
          variants={fadeIn}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700 text-xs sm:text-sm text-slate-300 mb-6"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Empowering Ethiopian Tech
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight mb-2"
        >
          Build the Future of <br className="hidden sm:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
            Tech in Habesha
          </span>
        </motion.h1>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-lg sm:text-xl md:text-2xl font-medium text-emerald-400/80 mb-5 font-serif"
        >
          የኢትዮጵያ የቴክኖሎጂ ማህበረሰብ
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-base md:text-lg text-slate-400 max-w-2xl mb-8"
        >
          Join the fastest growing community of developers, designers, and tech enthusiasts in Ethiopia. Learn, build, and innovate together.
        </motion.p>
        
      </section>

      {/* News Section (API Data) */}
      <section id="news" className="py-12 md:py-16 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Latest Tech News</h2>
              <p className="text-emerald-400 font-medium text-lg">ትኩስ የቴክኖሎጂ ዜናዎች</p>
            </div>
          </div>
          
          {loadingNews ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mb-4" />
              <p>ዜናዎችን በማምጣት ላይ...</p>
            </div>
          ) : news.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-y-0 md:gap-6 -mx-4 sm:mx-0 bg-[#0d131f] md:bg-transparent">
              {news.map((item) => (
                <NewsCard key={item.id} item={item} onClick={() => setSelectedNews(item)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-slate-800 text-slate-400">
              <p>No news available right now.</p>
            </div>
          )}
          
          <div className="mt-8">
            <GoogleAdPlaceholder slot="news-bottom" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="services" className="py-12 md:py-16 bg-slate-900 border-y border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">What We Do</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">We provide the resources, network, and platforms needed to accelerate technology adoption and creation in our region.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Code className="w-8 h-8 text-emerald-400" />}
              title="Workshops & Coding"
              description="Hands-on learning sessions covering the latest web, mobile, and AI technologies."
            />
            <FeatureCard 
              icon={<Users className="w-8 h-8 text-cyan-400" />}
              title="Community Network"
              description="Connect with like-minded individuals, find mentors, and collaborate on open-source projects."
            />
            <FeatureCard 
              icon={<Newspaper className="w-8 h-8 text-yellow-400" />}
              title="Tech Insights"
              description="Stay updated with the latest in Ethiopian tech startup news, trends, and market analysis."
            />
          </div>
        </div>
      </section>

      {/* Stats/Highlight Section */}
      <section id="about" className="py-12 md:py-16 border-b border-slate-800 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 md:p-16 border border-slate-700 flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden">
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none"></div>
            <div className="md:w-1/2 relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Bridging the Gap Between Talent and Opportunity</h2>
              <p className="text-slate-400 mb-8">
                Our mission is to cultivate world-class tech talent locally. By providing access to mentorship, tools, and a thriving ecosystem, we are shaping the next generation of tech leaders.
              </p>
              <ul className="space-y-4">
                <ListItem text="Over 5,000+ active members" />
                <ListItem text="Monthly hackathons and meetups" />
                <ListItem text="Partnerships with leading tech companies" />
              </ul>
            </div>
            <div className="md:w-1/2 grid grid-cols-2 gap-4 relative z-10">
              <StatBox number="5K+" label="Members" />
              <StatBox number="50+" label="Events Hosted" />
              <StatBox number="20+" label="Partners" />
              <StatBox number="100+" label="Projects Launched" />
            </div>
          </div>
        </div>
      </section>

      {/* Community / Events Section */}
      <section id="community" className="py-12 md:py-16 bg-slate-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Upcoming Events</h2>
              <p className="text-emerald-400 font-medium text-lg">ቀጣይ ሁነቶች</p>
            </div>
            <button className="text-slate-300 hover:text-emerald-400 transition-colors flex items-center gap-2 mt-6 md:mt-0 cursor-pointer font-medium">
              View All Events <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            <EventCard 
              date="OCT 15"
              title="Addis Tech Summit 2026"
              location="Skylight Hotel, Addis Ababa"
              tags={["Conference", "Networking"]}
            />
            <EventCard 
              date="NOV 02"
              title="Habesha Hacks: AI Edition"
              location="Virtual Event / Discord"
              tags={["Hackathon", "AI/ML"]}
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="contact" className="py-16 md:py-20 text-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="max-w-3xl mx-auto relative z-10">
          <Globe className="w-16 h-16 text-emerald-500 mx-auto mb-6" />
          <h2 className="text-4xl font-bold mb-2">Ready to make an impact?</h2>
          <h3 className="text-xl font-medium text-emerald-400 mb-6">አብረውን ይስሩ</h3>
          <p className="text-lg text-slate-400 mb-10 leading-relaxed">
            Join Tech Habesha today and start building the solutions of tomorrow. <br className="hidden md:block" />
            Subscribe to our newsletter for community updates.
          </p>
          
          <form className="flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto" onSubmit={(e) => e.preventDefault()}>
            <input 
              type="email" 
              placeholder="Enter your email address" 
              className="bg-slate-900 border border-slate-700 text-slate-100 px-6 py-4 rounded-full flex-grow focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-500"
              required
            />
            <button type="submit" className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 cursor-pointer flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              Subscribe
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img src={techLogo} alt="Tech Habesha Logo" className="w-8 h-8 rounded-full object-cover border border-slate-800" />
            <span className="font-bold tracking-tight">TECH <span className="text-emerald-500">HABESHA</span></span>
          </div>
          
          <div className="flex gap-6 text-sm text-slate-400">
            <a href="#privacy" onClick={(e) => { e.preventDefault(); window.location.hash = 'privacy'; setShowPrivacyPolicy(true); }} className="hover:text-emerald-400 inline-block">Privacy Policy</a>
            <a href="#terms" onClick={(e) => { e.preventDefault(); window.location.hash = 'terms'; setShowTermsOfService(true); }} className="hover:text-emerald-400 inline-block">Terms of Service</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); window.location.hash = 'contact'; setShowContactUs(true); }} className="hover:text-emerald-400 inline-block">Contact Us</a>
            <a href="#about" onClick={(e) => { e.preventDefault(); window.location.hash = 'about'; setShowAboutUs(true); }} className="hover:text-emerald-400 inline-block">About Us</a>
          </div>

          <div className="flex gap-4">
            <a href="https://x.com/Techhabeshas" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#1DA1F2] transition-colors cursor-pointer" title="X/Twitter">
              <Twitter className="w-5 h-5" />
            </a>
            <a href="https://www.youtube.com/@TechHabeshas" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#FF0000] transition-colors cursor-pointer" title="YouTube">
              <Youtube className="w-5 h-5" />
            </a>
            <a href="https://www.facebook.com/techhabesha" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#1877F2] transition-colors cursor-pointer" title="Facebook">
              <Facebook className="w-5 h-5" />
            </a>
            <a href="https://t.me/TechHabeshas" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#0088cc] transition-colors cursor-pointer" title="Telegram Channel">
              <Send className="w-5 h-5 mx-0.5" />
            </a>
            <a href="https://t.me/TechHabeshas_bot" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#0088cc] transition-colors cursor-pointer" title="Telegram Bot">
              <span className="flex items-center gap-1 font-medium text-xs border border-current rounded-md px-1.5 py-0.5">BOT</span>
            </a>
            <a href="https://tiktok.com/@tech_habeshas" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors cursor-pointer" title="TikTok">
              {/* Custom TikTok SVG */}
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>
              </svg>
            </a>
          </div>
        </div>
        <div className="text-center text-slate-600 text-sm mt-8">
          © {new Date().getFullYear()} Tech Habesha. All rights reserved.
        </div>
      </footer>

      {/* Modal for Full News reading */}
      {selectedNews && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedNews(null)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-start gap-4">
              <h3 className="text-xl md:text-2xl font-bold text-slate-100 pr-8 flex-grow">{selectedNews.title}</h3>
              <div className="flex gap-2 shrink-0">
                {isAdmin && selectedNews.source !== "Hacker News" && selectedNews.source !== "TechCrunch" && selectedNews.source !== "The Verge" && selectedNews.source !== "Engadget" && (
                  <button 
                    onClick={() => handleDeleteNews(selectedNews.id, selectedNews.source)} 
                    className="text-rose-400 hover:text-white transition-colors cursor-pointer bg-rose-950/50 hover:bg-rose-900/50 p-2 rounded-full"
                    title="Delete Post"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button 
                  onClick={handleModalShare} 
                  className="text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer bg-slate-800 p-2 rounded-full"
                  title="Share to social media"
                >
                  <Share2 className="w-5 h-5" />
                </button>
                <button onClick={() => setSelectedNews(null)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-grow overflow-hidden bg-slate-950/50 flex flex-col relative rounded-b-2xl">
              <div className="px-6 py-3 flex justify-between items-center bg-slate-900 border-b border-slate-800 shrink-0">
                <div className="flex gap-4">
                  <span className="text-sm font-medium text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md">
                    {selectedNews.source === "Engadget - Technology News & Expert Reviews" || selectedNews.source === "Engadget" || selectedNews.source === "The Verge" || selectedNews.source === "Hacker News" ? "TECH HABESHA" : selectedNews.source}
                  </span>
                  <span className="text-sm text-slate-400 py-1 font-medium">
                    {new Date(selectedNews.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                
              </div>

              <div className="p-6 md:p-8 flex flex-col flex-grow bg-slate-950 overflow-y-auto rounded-b-2xl">
                <div className="text-slate-300 text-lg leading-relaxed whitespace-pre-wrap flex-grow">
                  {selectedNews.content}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Admin Post Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowAdminModal(false)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-500" /> Post Tech News
              </h3>
              <button onClick={() => setShowAdminModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto w-full">
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const title = (form.elements.namedItem("title") as HTMLInputElement).value;
                  const content = (form.elements.namedItem("content") as HTMLTextAreaElement).value;
                  const source = (form.elements.namedItem("source") as HTMLInputElement).value;
                  const link = (form.elements.namedItem("link") as HTMLInputElement).value;
                  const imageUrl = (form.elements.namedItem("imageUrl") as HTMLInputElement).value;
                  const metaDescription = (form.elements.namedItem("metaDescription") as HTMLTextAreaElement).value;
                  
                  try {
                    await addDoc(collection(db, "custom_news"), {
                      title,
                      content,
                      source,
                      link,
                      imageUrl: imageUrl || null,
                      metaDescription: metaDescription || null,
                      date: serverTimestamp(),
                      authorId: user?.uid
                    });
                    
                    form.reset();
                    setShowAdminModal(false);
                    fetchUpdatedNews();
                  } catch (error) {
                    console.error("Error adding document: ", error);
                    alert("Failed to add news");
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                  <input type="text" name="title" required className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Content/Article</label>
                  <textarea name="content" required rows={6} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Source Name</label>
                    <input type="text" name="source" placeholder="e.g. Habesha Tech" defaultValue="Tech Habesha" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Read More URL (optional)</label>
                    <input type="url" name="link" placeholder="https://" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Image URL (optional)</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-500" />
                    <input type="url" name="imageUrl" placeholder="https://" className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-400">Meta Description (SEO)</label>
                    <span id="meta-counter" className="text-xs text-slate-500">0 / 160</span>
                  </div>
                  <textarea 
                    name="metaDescription" 
                    rows={2} 
                    maxLength={160}
                    onInput={(e) => {
                      const counter = document.getElementById('meta-counter');
                      if (counter) counter.innerText = `${(e.target as HTMLTextAreaElement).value.length} / 160`;
                    }}
                    placeholder="Short description for Google Search results..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  ></textarea>
                </div>
                
                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowAdminModal(false)} className="px-5 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors font-medium cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-2 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" /> Publish News
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
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

      {/* Privacy Policy Modal */}
      {showPrivacyPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowPrivacyPolicy(false)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100">Privacy Policy</h3>
              <button onClick={() => setShowPrivacyPolicy(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto w-full text-slate-300 leading-relaxed text-sm">
              <p className="mb-4"><strong>Effective Date:</strong> {new Date().toLocaleDateString()}</p>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">1. Introduction</h4>
              <p className="mb-4">Welcome to Tech Habesha. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you about how we look after your personal data when you visit our website.</p>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">2. Information We Collect</h4>
              <p className="mb-4">We do not ask for personal information unless we truly need it. We collect non-personally-identifiable information of the sort that web browsers and servers typically make available, such as the browser type, language preference, referring site, and the date and time of each visitor request.</p>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">3. Google AdSense and Cookies</h4>
              <p className="mb-2">We use Google AdSense to serve advertisements to our users. Google, as a third-party vendor, uses cookies to serve ads on our site.</p>
              <ul className="list-disc pl-6 mb-4 space-y-2">
                <li>Google's use of advertising cookies enables it and its partners to serve ads to our users based on their visit to our sites and/or other sites on the Internet.</li>
                <li>Users may opt out of personalized advertising by visiting <a href="https://myadcenter.google.com/" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">Google's Ads Settings</a>.</li>
                <li>Alternatively, users can opt out of a third-party vendor's use of cookies for personalized advertising by visiting <a href="https://aboutads.info" target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline">aboutads.info</a>.</li>
              </ul>
              
              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">4. Third-Party Links</h4>
              <p className="mb-4">Our website may contain links to third-party websites, plug-ins, and applications. Clicking on those links or enabling those connections may allow third parties to collect or share data about you. We do not control these third-party websites and are not responsible for their privacy statements.</p>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">5. Changes to this Privacy Policy</h4>
              <p className="mb-4">We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>

              <h4 className="text-lg text-emerald-400 font-bold mt-6 mb-2">6. Contact Us</h4>
              <p className="mb-4">If you have any questions about this Privacy Policy, please contact us at our official Telegram channel or via administrator email.</p>
            </div>
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 rounded-b-2xl flex justify-end">
              <button 
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer"
                onClick={() => setShowPrivacyPolicy(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Us Modal */}
      {showAboutUs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowAboutUs(false)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">About Us</h3>
              <button onClick={() => setShowAboutUs(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto w-full text-slate-300 leading-relaxed text-sm">
              <div className="flex justify-center mb-6">
                <img src={techLogo} alt="Tech Habesha Logo" className="w-24 h-24 rounded-full object-cover border-4 border-emerald-500/20 shadow-lg" />
              </div>
              <h4 className="text-2xl text-center font-bold text-white mb-6">Tech Habesha</h4>
              
              <div className="space-y-4 text-base">
                <p>Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, dedicated to empowering the Ethiopian tech ecosystem.</p>
                
                <p>Our mission is to bring you the latest, most relevant technological advancements, startup news, and digital trends from around the world and tailor them for our local audience. We aim to bridge the information gap and foster a thriving community of developers, innovators, tech enthusiasts, and digital creators.</p>
                
                <h4 className="text-lg font-bold text-emerald-400 pt-4">What We Do</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>News Aggregation:</strong> We curate top-tier technology news from global sources and local tech updates.</li>
                  <li><strong>Community Building:</strong> Through our Telegram channels and social media presence, we build discussions around emerging tech.</li>
                  <li><strong>Innovation Support:</strong> We spotlight local startups and digital initiatives, giving them the visibility they deserve.</li>
                </ul>

                <h4 className="text-lg font-bold text-emerald-400 pt-4">Our Vision</h4>
                <p>To be the primary digital hub and source of truth for technology, computing, and digital lifestyle in Ethiopia, inspiring the next generation of African tech leaders.</p>

                <div className="pt-6 border-t border-slate-800 mt-6 flex justify-center gap-4">
                  <a href="https://t.me/TechHabeshas" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-[#0088cc] hover:bg-[#0077b3] text-white font-medium rounded-lg transition-colors inline-block">
                    Join Our Telegram
                  </a>
                  <a href="https://tiktok.com/@tech_habeshas" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition-colors inline-block border border-slate-600">
                    Follow on TikTok
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contact Us Modal */}
      {showContactUs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowContactUs(false)}>
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">Contact Us</h3>
              <button onClick={() => setShowContactUs(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer bg-slate-800 p-2 rounded-full shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 text-slate-300 leading-relaxed text-sm space-y-6">
              <div className="flex justify-center mb-2">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/50">
                  <Mail className="w-8 h-8 text-emerald-400" />
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <h4 className="text-lg font-bold text-white">Get in Touch</h4>
                <p className="text-slate-400">Have questions, feedback, or business inquiries? We'd love to hear from you!</p>
              </div>

              <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Email Us</div>
                    <a href="mailto:gashaw7abi@gmail.com" className="text-sm font-medium text-slate-200 hover:text-emerald-400 transition-colors">gashaw7abi@gmail.com</a>
                  </div>
                </div>
                
                <div className="h-px bg-slate-800 w-full"></div>
                
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center shrink-0">
                    <Send className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Telegram</div>
                    <a href="https://t.me/TechHabeshas" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-200 hover:text-blue-400 transition-colors">@TechHabeshas</a>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <a 
                  href="mailto:gashaw7abi@gmail.com" 
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Send an Email
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: import("react").ReactNode, title: string, description: string }) {
  return (
    <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700 hover:border-emerald-500/50 transition-colors group">
      <div className="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function ListItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3 text-slate-300">
      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
        <ChevronRight className="w-4 h-4 text-emerald-400" />
      </div>
      {text}
    </li>
  );
}

function StatBox({ number, label }: { number: string, label: string }) {
  return (
    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 text-center hover:bg-slate-800/50 transition-colors">
      <div className="text-3xl font-bold text-emerald-400 mb-1">{number}</div>
      <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}

function EventCard({ date, title, location, tags }: { date: string, title: string, location: string, tags: string[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-start gap-4 hover:border-emerald-500/40 transition-colors group cursor-pointer h-full">
      <div className="flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-xl min-w-[70px] h-[70px] p-2 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/30 transition-colors shrink-0">
        <span className="text-emerald-500 font-bold text-2xl leading-none">{date.split(' ')[1]}</span>
        <span className="text-slate-400 text-xs font-semibold tracking-wider mt-1">{date.split(' ')[0]}</span>
      </div>
      <div>
        <h3 className="text-lg font-bold mb-1 text-slate-100 group-hover:text-emerald-400 transition-colors">{title}</h3>
        <p className="text-slate-400 text-sm mb-3">{location}</p>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const NewsCard: React.FC<{ item: NewsItem, onClick: () => void }> = ({ item, onClick }) => {
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await shareContent(item.title, item.content, item.imageUrl);
  };

  return (
    <div 
      className="bg-[#0f1523] border-b border-slate-800/80 md:bg-slate-900/40 md:border md:border-slate-800 md:rounded-2xl flex flex-col hover:border-emerald-500/50 hover:bg-slate-800/40 transition-all group h-full md:overflow-hidden pb-4 md:pb-0"
    >
      {item.imageUrl && (
        <div className="w-full h-56 md:h-40 bg-slate-800 overflow-hidden shrink-0">
          <img 
            src={item.imageUrl} 
            alt={item.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-4 md:p-6 flex flex-col flex-grow">
        <div className="flex mb-4">
          <span className="text-xs font-bold text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-full tracking-wider">
            {item.source === "Engadget - Technology News & Expert Reviews" || item.source === "Engadget" || item.source === "The Verge" || item.source === "Hacker News" || item.source === "TechCrunch" ? "TECH HABESHA" : item.source.toUpperCase()}
          </span>
        </div>
        <h3 className="text-xl md:text-xl font-bold md:mb-3 text-slate-100 group-hover:text-emerald-400 transition-colors leading-snug">
          {item.title}
        </h3>
        <p className="text-slate-400 text-sm md:text-base flex-grow mb-6 mt-4 md:mt-0 leading-relaxed whitespace-pre-line">
          {item.content}
        </p>
        <div className="flex justify-between items-center mt-auto md:pt-4">
          <span className="text-sm font-semibold text-slate-500">
            {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          <button 
            onClick={handleShare}
            className="p-3 bg-slate-800/60 md:bg-slate-800/40 border border-slate-700/50 rounded-full hover:bg-slate-700 md:hover:bg-slate-800 text-slate-300 md:text-slate-400 hover:text-emerald-400 transition-colors"
            title="Share to social media"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

const GoogleAdPlaceholder: React.FC<{ slot?: string }> = ({ slot }) => {
  return (
    <div className="w-full bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center p-6 text-slate-500 my-6 relative overflow-hidden">
      <span className="text-xs font-medium absolute top-2 right-3 text-slate-600">Advertisement</span>
      <div className="w-full h-24 md:h-32 flex items-center justify-center">
        {/* Actual Google AdSense element */}
        {/* <ins className="adsbygoogle w-full"
             style={{ display: 'block', minHeight: '90px' }}
             data-ad-client="ca-pub-YOUR_ADSENSE_ID"
             data-ad-slot={slot || "YOUR_AD_SLOT"}
             data-ad-format="auto"
             data-full-width-responsive="true"></ins> */}
        <p className="text-sm border border-dashed border-slate-700 px-6 py-4 rounded-lg">Google Ad Space {slot ? `(${slot})` : ''} - (Add Client ID in index.html and configure slot here)</p>
      </div>
    </div>
  );
}
