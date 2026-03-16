
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";
import {
    getFirestore,
    collection,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { firebaseConfig, GROQ_API_KEY, UNSPLASH_ACCESS_KEY } from "./config.js";

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

const $ = id => document.getElementById(id);
const loginPage = $("loginPage");
const dashboard = $("dashboard");
const loginForm = $("loginForm");
const emailInput = $("emailInput");
const passwordInput = $("passwordInput");
const loginBtn = $("loginBtn");
const loginError = $("loginError");
const logoutBtn = $("logoutBtn");
const adminEmailEl = $("adminEmail");
const topicInput = $("topicInput");
const categorySelect = $("categorySelect");
const toneSelect = $("toneSelect");
const generateBtn = $("generateBtn");
const progressLog = $("progressLog");
const adminPostsList = $("adminPostsList");
const adminPostsCount = $("adminPostsCount");
const toast = $("toast");

const savedTheme = localStorage.getItem("bb-theme");
if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);

onAuthStateChanged(auth, user => {
    if (user) {
        loginPage.classList.add("hidden");
        dashboard.classList.remove("hidden");
        adminEmailEl.textContent = user.email;
        startPostsListener();
    } else {
        loginPage.classList.remove("hidden");
        dashboard.classList.add("hidden");
    }
});

loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    loginError.textContent = "";
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in…";
    try {
        await signInWithEmailAndPassword(
            auth,
            emailInput.value.trim(),
            passwordInput.value
        );
    } catch (err) {
        loginError.textContent = friendlyAuthError(err.code);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
    }
});

function friendlyAuthError(code) {
    const map = {
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/user-not-found": "No account found with that email.",
        "auth/wrong-password": "Incorrect password. Please try again.",
        "auth/invalid-credential": "Wrong email or password. Try again.",
        "auth/user-disabled": "This account has been disabled.",
        "auth/network-request-failed": "Network error — check your connection.",
        "auth/too-many-requests":
            "Too many attempts — wait a moment then try again."
    };
    return map[code] || `Sign-in failed (${code}). Please try again.`;
}

logoutBtn?.addEventListener("click", () => signOut(auth));

generateBtn?.addEventListener("click", generatePost);
topicInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") generatePost();
});

async function generatePost() {
    const topic =
        topicInput.value.trim() ||
        "a fascinating trending topic right now in tech, science, lifestyle or personal growth";
    const category = categorySelect.value;
    const tone = toneSelect.value;

    generateBtn.disabled = true;
    generateBtn.classList.add("loading");
    generateBtn.querySelector(".btn-text").textContent = "Generating…";
    progressLog.innerHTML = "";
    progressLog.classList.add("active");

    try {
        log("🤖 Calling Groq API (llama-3.3-70b-versatile)…");
        const result = await callGroq(topic, category, tone);
        log(`✅ Post drafted: "${result.title.slice(0, 55)}…"`);

        log("🖼️  Fetching images from Unsplash…");
        const images = await fetchUnsplashImages(result.imageKeywords);
        log(`📷  Got ${images.length} image(s).`);

        log("💾 Saving to Firestore…");
        await addDoc(collection(db, "posts"), {
            title: result.title,
            content: result.content,
            excerpt: result.excerpt,
            images: images,
            imageKeywords: result.imageKeywords,
            tags: result.tags,
            readTime: result.readTime,
            topic: topic,
            category: category,
            date: serverTimestamp(),
            published: true
        });

        log("🚀 Published successfully!", "success");
        topicInput.value = "";
        showToast("🎉 Post published!");
        setTimeout(() => progressLog.classList.remove("active"), 6000);
    } catch (err) {
        log(`❌ Error: ${err.message}`, "error");
        showToast("Generation failed: " + err.message, true);
        console.error("[BlazeBlog] generatePost error:", err);
    } finally {
        generateBtn.disabled = false;
        generateBtn.classList.remove("loading");
        generateBtn.querySelector(".btn-text").textContent = "Generate Post";
    }
}

async function callGroq(topic, category, tone) {
    const todayStr = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const systemPrompt = `You are a professional, engaging blog writer with 10+ years of experience.
Writing style: ${tone} — like a knowledgeable friend who truly understands the topic.
Today's date: ${todayStr}

TASK: Write ONE complete, publication-ready blog post in markdown format.
Topic: ${topic}
Category: ${category}

STRICT RULES:
- Length: 800–1200 words (aim for ~950)
- Structure:
  1. H1 title — catchy, benefit- or curiosity-driven
  2. Engaging intro (2–3 paragraphs, hook + value)
  3. 4–7 H2 subheadings (logical flow, search-intent answers)
  4. H3 sub-points where needed
  5. At least 2–3 bullet or numbered lists
  6. Conclusion with a call-to-action or thought-provoking question
- Use **bold**, *italic*, > blockquotes naturally
- Speak directly to the reader using "you"
- 100% original content only
- NO HTML tags — pure markdown only

IMAGE PLACEHOLDERS: Include exactly 4 image placeholders anywhere in the body:
![Descriptive alt text](https://placehold.co/800x450/14b8a6/ffffff?text=Image)

RESPOND IN THIS EXACT FORMAT — start immediately with TITLE: on the first line:
TITLE: [blog post title here]
TAGS: [tag1, tag2, tag3] — pick from: technology, science, lifestyle, health, business, ai
KEYWORDS: [5 Unsplash search keywords, comma-separated, each 2–4 words]
---
[Full markdown post starting with # Title]`;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 3000,
            temperature: 0.8,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Write a blog post about: ${topic}` }
            ]
        })
    });

    if (!res.ok) {
        let errMsg = `Groq API error ${res.status}`;
        try {
            const errData = await res.json();
            console.error("[BlazeBlog] Groq error body:", errData);
            errMsg = errData.error?.message || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";

    if (!raw) throw new Error("Groq returned an empty response. Try again.");
    if (!raw.includes("TITLE:")) {
        console.warn("[BlazeBlog] Unexpected format:", raw.slice(0, 300));
        return {
            title: `${category.charAt(0).toUpperCase() + category.slice(1)} — ${new Date().toLocaleDateString()}`,
            content: raw,
            excerpt:
                raw
                    .split("\n")
                    .find(l => l.trim() && !l.startsWith("#"))
                    ?.slice(0, 200) || "",
            tags: [category],
            imageKeywords: [topic.slice(0, 30), category, "technology blog"],
            readTime: Math.ceil(raw.split(/\s+/).length / 220)
        };
    }

    return parseGroqResponse(raw);
}

function parseGroqResponse(raw) {
    const lines = raw.split("\n");
    const getLine = prefix =>
        lines.find(l => l.trimStart().startsWith(prefix)) || "";
    const extract = prefix =>
        getLine(prefix)
            .replace(prefix, "")
            .replace(/[\[\]]/g, "")
            .trim();

    const title = extract("TITLE:")
        .replace(/^#+\s*/, "")
        .replace(/\*\*/g, "");
    const tagsRaw = extract("TAGS:");
    const kwRaw = extract("KEYWORDS:");

    const tags = tagsRaw
        .split(",")
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, 3);
    const imageKeywords = kwRaw
        .split(",")
        .map(k => k.trim())
        .filter(Boolean)
        .slice(0, 5);

    const sepIdx = raw.indexOf("\n---\n");
    const content = sepIdx !== -1 ? raw.slice(sepIdx + 5).trim() : raw;

    const excerpt =
        content
            .split("\n")
            .filter(
                l =>
                    l.trim() &&
                    !l.startsWith("#") &&
                    !l.startsWith("!") &&
                    !l.startsWith(">") &&
                    !l.startsWith("-")
            )[0]
            ?.replace(/\*\*/g, "")
            .slice(0, 220) || "";

    const wordCount = content.split(/\s+/).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 220));

    if (!title) throw new Error("Could not parse title from Groq response.");

    return { title, content, excerpt, tags, imageKeywords, readTime };
}

async function fetchUnsplashImages(keywords) {
    const urls = [];
    for (const kw of (keywords || []).slice(0, 5)) {
        try {
            const res = await fetch(
                `https://api.unsplash.com/search/photos?query=${encodeURIComponent(kw)}&per_page=1&orientation=landscape&client_id=${UNSPLASH_ACCESS_KEY}`
            );
            if (!res.ok) throw new Error(`Unsplash ${res.status}`);
            const data = await res.json();
            urls.push(data.results?.[0]?.urls?.regular || fallbackImg(kw));
        } catch (err) {
            console.warn(
                `[BlazeBlog] Unsplash failed for "${kw}":`,
                err.message
            );
            urls.push(fallbackImg(kw));
        }
    }
    return urls;
}

function fallbackImg(kw) {
    return `https://placehold.co/800x450/14b8a6/ffffff?text=${encodeURIComponent((kw || "Post").slice(0, 25))}`;
}

let unsubscribe = null;

function startPostsListener() {
    if (unsubscribe) unsubscribe();
    const q = query(collection(db, "posts"), orderBy("date", "desc"));
    unsubscribe = onSnapshot(
        q,
        snapshot => {
            const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            adminPostsCount.textContent = `${posts.length} post${posts.length !== 1 ? "s" : ""}`;
            renderAdminPosts(posts);
        },
        err => {
            console.error("[BlazeBlog] Firestore error:", err);
            adminPostsList.innerHTML =
                '<p class="admin-empty" style="color:#f87171">Failed to load posts — check Firestore rules.</p>';
        }
    );
}

function renderAdminPosts(posts) {
    if (posts.length === 0) {
        adminPostsList.innerHTML =
            '<p class="admin-empty">No posts yet — generate your first one above! 🚀</p>';
        return;
    }
    adminPostsList.innerHTML = posts.map(p => adminPostItemHTML(p)).join("");
    adminPostsList.querySelectorAll(".delete-btn").forEach((btn, i) => {
        btn.addEventListener("click", () =>
            deletePost(posts[i].id, posts[i].title)
        );
    });
}

function adminPostItemHTML(p) {
    const img =
        (p.images && p.images[0]) ||
        `https://placehold.co/76x52/14b8a6/ffffff?text=Post`;
    const date = p.date?.toDate
        ? p.date
              .toDate()
              .toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric"
              })
        : "Just now";
    const tags = (p.tags || [])
        .slice(0, 2)
        .map(t => `<span class="tag">${esc(t)}</span>`)
        .join("");

    return `
    <div class="admin-post-item">
      <div class="admin-post-thumb">
        <img src="${img}" alt="" loading="lazy" width="76" height="52">
      </div>
      <div class="admin-post-info">
        <div class="admin-post-title">${esc(p.title)}</div>
        <div class="admin-post-meta">
          <span>${date}</span>
          <span>·</span>
          <span>${p.readTime || 5} min read</span>
          ${tags}
        </div>
      </div>
      <button class="delete-btn" aria-label="Delete post" title="Delete post">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>`;
}

async function deletePost(id, title) {
    if (!confirm(`Delete "${title}"?\nThis cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, "posts", id));
        showToast("Post deleted.");
    } catch (err) {
        showToast("Delete failed: " + err.message, true);
        console.error("[BlazeBlog] deletePost error:", err);
    }
}

function log(msg, type = "") {
    const line = document.createElement("div");
    line.className = `log-line ${type}`.trim();
    line.textContent = msg;
    progressLog.appendChild(line);
    progressLog.scrollTop = progressLog.scrollHeight;
}

function showToast(msg, isErr = false) {
    toast.textContent = msg;
    toast.className = `toast${isErr ? " error" : " success"}`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3500);
}

function esc(s = "") {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
