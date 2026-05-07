      window.__timelines = window.__timelines || {};

      const CAPTIONS = [
        { text: "YOUR AI KEEPS", start: 0.05, end: 0.78, accent: [1] },
        { text: "REPEATING THE SAME MISTAKE", start: 0.78, end: 2.21, accent: [3] },
        { text: "TEAMAGENT", start: 2.73, end: 3.27, accent: [0] },
        { text: "STOPS THE LOOP", start: 3.27, end: 4.05, accent: [2] },
        { text: "CAPTURE THE FAIL", start: 4.22, end: 4.9, accent: [0, 2] },
        { text: "COMPILE THE RULE", start: 5.29, end: 6.22, accent: [0, 2] },
        { text: "WARN BEFORE", start: 6.38, end: 7.0, accent: [0] },
        { text: "THE DAMAGE LANDS", start: 7.0, end: 7.93, accent: [1, 2] },
        { text: "CORRECT IT ONCE", start: 8.13, end: 8.87, accent: [0, 2] },
        { text: "EVERY FUTURE", start: 9.03, end: 9.66, accent: [1] },
        { text: "AGENT REMEMBERS", start: 9.66, end: 10.29, accent: [1] },
        { text: "CLAUDE CODE", start: 11.05, end: 11.61, accent: [0] },
        { text: "CODEX", start: 11.86, end: 12.2, accent: [0] },
        { text: "ONE TEAM MEMORY", start: 12.33, end: 13.09, accent: [2] },
        { text: "TEACH IT ONCE", start: 13.45, end: 14.27, accent: [0, 2] },
        { text: "STOP PAYING TWICE", start: 14.53, end: 15.49, accent: [0, 2] },
      ];

      const captionLayer = document.getElementById("caption-layer");

      CAPTIONS.forEach((group, gi) => {
        const groupEl = document.createElement("div");
        groupEl.className = "caption-group";
        groupEl.id = "cg-" + gi;

        group.text.split(" ").forEach((word, wi) => {
          const wordEl = document.createElement("span");
          wordEl.className = "caption-word" + (group.accent.includes(wi) ? " accent" : "");
          wordEl.textContent = word;
          groupEl.appendChild(wordEl);
        });

        captionLayer.appendChild(groupEl);
      });

      const tl = gsap.timeline({ paused: true });

      function transition(outId, inId, at, enterEase, exitEase, enterY, exitY) {
        tl.set(inId, { display: "block" }, at);
        tl.to(outId, { opacity: 0, y: exitY, scale: 1.07, filter: "blur(18px)", duration: 0.28, ease: exitEase }, at);
        tl.fromTo(
          inId,
          { opacity: 0, y: enterY, scale: 0.92, filter: "blur(18px)" },
          { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.44, ease: enterEase },
          at + 0.04,
        );
        tl.set(outId, { display: "none" }, at + 0.3);
      }

      tl.set(".scene-shell", { display: "none" }, 0);
      tl.set("#scene-1 .scene-shell", { display: "block" }, 0);
      tl.fromTo("#scene-1 .scene-shell", { opacity: 0, y: 90, scale: 0.93, filter: "blur(18px)" }, { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.52, ease: "expo.out" }, 0.18);
      tl.fromTo("#scene-1 .eyebrow", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.36, ease: "circ.out" }, 0.24);
      tl.fromTo("#scene-1 .status-chip", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" }, 0.3);
      tl.fromTo("#scene-1 .micro-chip", { opacity: 0, scaleX: 0.4 }, { opacity: 1, scaleX: 1, duration: 0.34, ease: "sine.out" }, 0.42);
      tl.fromTo("#scene-1 .hero-title", { opacity: 0, y: 90, letterSpacing: "0.02em" }, { opacity: 1, y: 0, letterSpacing: "-0.05em", duration: 0.62, ease: "back.out(1.2)" }, 0.5);
      tl.fromTo("#scene-1 .hero-sub", { opacity: 0, y: 42 }, { opacity: 1, y: 0, duration: 0.38, ease: "power2.out" }, 0.72);
      tl.fromTo("#scene-1 .chip", { opacity: 0, y: 34, scale: 0.92 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, stagger: 0.06, ease: "back.out(1.4)" }, 0.82);
      tl.fromTo("#scene-1 .scene-rail", { scaleX: 0.14, opacity: 0.2 }, { scaleX: 1, opacity: 1, duration: 1.2, ease: "none" }, 0.22);
      tl.fromTo("#scene-1 .product-shot.mobile", { opacity: 0, x: 86, y: 64, rotate: 14, scale: 0.86 }, { opacity: 1, x: 0, y: 0, rotate: 7, scale: 1, duration: 0.58, ease: "back.out(1.25)", overwrite: "auto" }, 0.68);
      tl.to("#scene-1 .product-shot.mobile", { y: -16, rotate: 5, duration: 2.1, ease: "sine.inOut", overwrite: "auto" }, 1.32);
      tl.to("#scene-1 .scene-glow", { x: -28, y: 24, scale: 1.08, duration: 2.8, ease: "sine.inOut" }, 0.18);

      transition("#scene-1 .scene-shell", "#scene-2 .scene-shell", 2.95, "power3.out", "power4.in", 150, -120);
      tl.fromTo("#scene-2 .eyebrow", { opacity: 0, y: -28 }, { opacity: 1, y: 0, duration: 0.28, ease: "expo.out" }, 3.06);
      tl.fromTo("#scene-2 .block-title", { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.38, ease: "power2.out" }, 3.16);
      tl.fromTo("#scene-2 .evidence-card", { opacity: 0, y: 80, rotateZ: 0.6 }, { opacity: 1, y: 0, rotateZ: 0, duration: 0.38, stagger: 0.08, ease: "back.out(1.25)" }, 3.28);
      tl.fromTo("#scene-2 .metric", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.24, stagger: 0.05, ease: "circ.out" }, 3.54);
      tl.to("#scene-2 .scene-glow", { x: 22, y: -18, scale: 1.06, duration: 2.2, ease: "sine.inOut" }, 3.02);

      transition("#scene-2 .scene-shell", "#scene-3 .scene-shell", 5.15, "expo.out", "power3.in", 120, -100);
      tl.fromTo("#scene-3 .eyebrow", { opacity: 0, x: -44 }, { opacity: 1, x: 0, duration: 0.24, ease: "sine.out" }, 5.24);
      tl.fromTo("#scene-3 .terminal-card", { opacity: 0, y: 68, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, stagger: 0.08, ease: "back.out(1.3)" }, 5.34);
      tl.fromTo("#scene-3 .block-title", { opacity: 0, y: 70 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" }, 5.48);
      tl.to("#scene-3 .scene-glow", { x: -34, y: -12, scale: 1.04, duration: 2.1, ease: "sine.inOut" }, 5.2);

      transition("#scene-3 .scene-shell", "#scene-4 .scene-shell", 7.25, "power3.out", "power4.in", 132, -110);
      tl.fromTo("#scene-4 .eyebrow", { opacity: 0, x: -38 }, { opacity: 1, x: 0, duration: 0.22, ease: "circ.out" }, 7.34);
      tl.fromTo("#scene-4 .danger-banner", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.32, ease: "back.out(1.35)" }, 7.42);
      tl.fromTo("#scene-4 .chip", { opacity: 0, y: 32 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.06, ease: "expo.out" }, 7.56);
      tl.fromTo("#scene-4 .terminal-card", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.3, ease: "power2.out" }, 7.72);
      tl.to("#scene-4 .scene-glow", { x: -16, y: 22, scale: 1.08, duration: 2.5, ease: "sine.inOut" }, 7.28);

      transition("#scene-4 .scene-shell", "#scene-5 .scene-shell", 9.65, "power3.out", "power4.in", 136, -124);
      tl.fromTo("#scene-5 .eyebrow", { opacity: 0, y: -26 }, { opacity: 1, y: 0, duration: 0.22, ease: "expo.out" }, 9.74);
      tl.fromTo("#scene-5 .block-title", { opacity: 0, y: 82 }, { opacity: 1, y: 0, duration: 0.36, ease: "power2.out" }, 9.86);
      tl.fromTo("#scene-5 .timeline-card", { opacity: 0, y: 70, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.34, ease: "back.out(1.28)" }, 10.02);
      tl.fromTo("#scene-5 .timeline-node b", { scaleX: 0.12 }, { scaleX: 1, duration: 0.48, stagger: 0.05, ease: "none" }, 10.14);
      tl.to("#scene-5 .scene-glow", { x: 28, y: -18, scale: 1.05, duration: 2.45, ease: "sine.inOut" }, 9.7);

      transition("#scene-5 .scene-shell", "#scene-6 .scene-shell", 12.05, "expo.out", "power4.in", 148, -118);
      tl.fromTo("#scene-6 .eyebrow", { opacity: 0, x: -36 }, { opacity: 1, x: 0, duration: 0.2, ease: "sine.out" }, 12.14);
      tl.fromTo("#scene-6 .block-title", { opacity: 0, y: 76 }, { opacity: 1, y: 0, duration: 0.36, ease: "back.out(1.2)" }, 12.24);
      tl.fromTo("#scene-6 .platform-card", { opacity: 0, x: 68 }, { opacity: 1, x: 0, duration: 0.34, stagger: 0.08, ease: "power3.out" }, 12.42);
      tl.fromTo("#scene-6 .product-shot.console", { opacity: 0, x: 84, y: 60, scale: 0.92 }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, 12.34);
      tl.to("#scene-6 .product-shot.console", { y: -10, scale: 1.03, duration: 2.5, ease: "sine.inOut" }, 12.72);
      tl.to("#scene-6 .scene-glow", { x: -28, y: -22, scale: 1.08, duration: 2.7, ease: "sine.inOut" }, 12.1);

      transition("#scene-6 .scene-shell", "#scene-7 .scene-shell", 14.75, "power3.out", "power4.in", 150, -130);
      tl.fromTo("#scene-7 .eyebrow", { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: 0.18, ease: "expo.out" }, 14.86);
      tl.fromTo("#scene-7 .cta-title", { opacity: 0, y: 100, letterSpacing: "0.01em" }, { opacity: 1, y: 0, letterSpacing: "-0.06em", duration: 0.44, ease: "back.out(1.15)" }, 14.98);
      tl.fromTo("#scene-7 .cta-sub", { opacity: 0, y: 44 }, { opacity: 1, y: 0, duration: 0.26, ease: "power2.out" }, 15.14);
      tl.fromTo("#scene-7 .brand-lockup", { opacity: 0, x: -48 }, { opacity: 1, x: 0, duration: 0.3, ease: "circ.out" }, 15.28);
      tl.fromTo("#scene-7 .micro-chip", { opacity: 0, x: 48 }, { opacity: 1, x: 0, duration: 0.24, ease: "sine.out" }, 15.34);
      tl.to("#scene-7 .scene-glow", { x: 22, y: 18, scale: 1.08, duration: 2.4, ease: "sine.inOut" }, 14.82);
      tl.to("#scene-7 .scene-shell", { opacity: 0, filter: "blur(20px)", duration: 0.36, ease: "power2.in" }, 15.43);
      tl.set("#scene-7 .scene-shell", { display: "none" }, 15.79);
      tl.to(".global-fade", { opacity: 1, duration: 0.38, ease: "power2.in" }, 15.41);

      CAPTIONS.forEach((group, gi) => {
        const groupEl = document.getElementById("cg-" + gi);
        const words = groupEl.querySelectorAll(".caption-word");
        tl.set(groupEl, { opacity: 1, visibility: "visible" }, group.start);
        tl.fromTo(
          words,
          { opacity: 0, y: 40, scale: 0.72, rotateZ: -4 },
          { opacity: 1, y: 0, scale: 1, rotateZ: 0, duration: 0.22, stagger: 0.055, ease: "back.out(1.7)" },
          group.start + 0.02,
        );
        tl.to(groupEl, { opacity: 0, y: -18, scale: 0.96, duration: 0.12, ease: "power2.in" }, group.end - 0.12);
        tl.set(groupEl, { opacity: 0, visibility: "hidden" }, group.end);
      });

      [
        "#bg-1",
        "#bg-2",
        "#bg-3",
      ].forEach((id, index) => {
        const start = [0, 5.758, 11.516][index];
        const duration = [5.758, 5.758, 4.274][index];
        tl.fromTo(id, { scale: 1.13, x: 0, y: 0 }, { scale: 1.03, x: index % 2 === 0 ? -18 : 18, y: -10, duration, ease: "none" }, start);
      });

      window.__timelines["main"] = tl;
