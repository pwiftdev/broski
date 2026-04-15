import * as THREE from "three";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BG_POP_PHRASES = [
  "yo broski",
  "sup broski",
  "oooo broski",
  "broski pls",
  "my broski",
  "real broski",
  "that guy broski",
  "run it broski",
  "let's go broski",
  "no cap broski",
  "sheesh broski",
  "W broski",
  "IYKYK broski",
  "backup broski",
  "crew broski",
  "locked in broski",
  "say less broski",
  "bet broski",
  "respect broski",
  "energy broski",
  "main character broski",
  "always broski",
  "$broski",
  "hey broski",
  "chill broski",
  "vibes broski"
];

let bgPopStarted = false;

function syncBgPopLayerHeight() {
  const layer = document.getElementById("bgPopLayer");
  if (!layer) return;
  layer.style.minHeight = `${document.documentElement.scrollHeight}px`;
}

function startBgPopTexts() {
  if (bgPopStarted) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const layer = document.getElementById("bgPopLayer");
  if (!layer) return;
  bgPopStarted = true;

  syncBgPopLayerHeight();
  const onLayout = () => syncBgPopLayerHeight();
  window.addEventListener("resize", onLayout, { passive: true });
  window.addEventListener("load", onLayout);

  const maxItems = 32;

  const spawn = () => {
    syncBgPopLayerHeight();
    const docHeight = document.documentElement.scrollHeight;
    const el = document.createElement("span");
    el.className = "bg-pop-item";
    el.textContent = BG_POP_PHRASES[Math.floor(Math.random() * BG_POP_PHRASES.length)];
    el.style.left = `${6 + Math.random() * 88}%`;
    el.style.top = `${Math.random() * docHeight}px`;
    el.style.animationDuration = `${3.6 + Math.random() * 2.4}s`;
    el.style.setProperty("--pop-tilt", `${-12 + Math.random() * 24}deg`);
    layer.appendChild(el);

    while (layer.children.length > maxItems) {
      layer.removeChild(layer.firstChild);
    }

    el.addEventListener(
      "animationend",
      () => {
        if (el.parentNode === layer) {
          layer.removeChild(el);
        }
      },
      { once: true }
    );
  };

  const scheduleNext = () => {
    window.setTimeout(() => {
      spawn();
      scheduleNext();
    }, 420 + Math.random() * 1600);
  };

  for (let i = 0; i < 7; i += 1) {
    window.setTimeout(spawn, i * 140);
  }
  scheduleNext();
}

function getImagePixelData(imagePath, targetDimension) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const maxDimension = targetDimension;
      const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
      const width = Math.max(1, Math.floor(image.width * scale));
      const height = Math.max(1, Math.floor(image.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (!context) {
        reject(new Error("Could not create 2D context for loader image"));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      resolve({ width, height, data: imageData.data });
    };
    image.onerror = reject;
    image.src = imagePath;
  });
}

async function runParticleLoader() {
  const loader = document.getElementById("loader");
  const canvasMount = document.getElementById("loader-canvas");
  if (!loader || !canvasMount) {
    return;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    loader.classList.add("loader-hidden");
    document.body.classList.remove("is-loading");
    startBgPopTexts();
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasMount.clientWidth, canvasMount.clientHeight);
  canvasMount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 8000);
  let camDist = 800;

  let rafId;
  let cleanupNeeded = true;
  const cleanup = () => {
    if (!cleanupNeeded) return;
    cleanupNeeded = false;
    cancelAnimationFrame(rafId);
    renderer.dispose();
    if (renderer.domElement.parentNode === canvasMount) {
      canvasMount.removeChild(renderer.domElement);
    }
  };

  try {
    const viewportMax = Math.max(window.innerWidth, window.innerHeight);
    const sourceDimension = viewportMax >= 1500 ? 640 : viewportMax >= 1100 ? 540 : 460;
    const step = viewportMax >= 1500 ? 2 : 3;
    const pointSize = viewportMax >= 1500 ? 1.85 : 2.2;

    const pixelData = await getImagePixelData("/loaderimage.png", sourceDimension);
    const threshold = 24;
    const pointData = [];
    const halfW = pixelData.width / 2;
    const halfH = pixelData.height / 2;

    for (let y = 0; y < pixelData.height; y += step) {
      for (let x = 0; x < pixelData.width; x += step) {
        const i = (y * pixelData.width + x) * 4;
        const alpha = pixelData.data[i + 3];
        if (alpha < threshold) continue;

        pointData.push({
          x: x - halfW,
          y: halfH - y,
          color: new THREE.Color(
            pixelData.data[i] / 255,
            pixelData.data[i + 1] / 255,
            pixelData.data[i + 2] / 255
          ),
          swirl: Math.random() * Math.PI * 2
        });
      }
    }

    const count = pointData.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const basePositions = new Float32Array(count * 3);
    const rawPositions = new Float32Array(count * 2);
    const introOffsets = new Float32Array(count * 3);
    const disperseOffsets = new Float32Array(count * 3);
    const swirls = new Float32Array(count);

    const getViewportMetrics = () => {
      const width = canvasMount.clientWidth;
      const height = canvasMount.clientHeight;
      return { width, height, maxDimension: Math.max(width, height) };
    };

    const initializeOffsets = () => {
      const viewport = getViewportMetrics();
      for (let i = 0; i < count; i += 1) {
        const b = i * 3;
        const p2 = i * 2;
        const baseX = rawPositions[p2];
        const baseY = rawPositions[p2 + 1];
        const len = Math.hypot(baseX, baseY) || 1;
        const dirX = baseX / len;
        const dirY = baseY / len;
        const entryRadius = viewport.maxDimension * (0.38 + Math.random() * 0.42);

        introOffsets[b] = dirX * entryRadius + (Math.random() - 0.5) * viewport.width * 0.2;
        introOffsets[b + 1] = dirY * entryRadius + (Math.random() - 0.5) * viewport.height * 0.2;
        introOffsets[b + 2] = (Math.random() - 0.5) * 120;

        // Disperse: slight XY jitter (Z rush uses perspective cam distance in animate)
        disperseOffsets[b] = (Math.random() - 0.5) * viewport.width * 0.05;
        disperseOffsets[b + 1] = (Math.random() - 0.5) * viewport.height * 0.05;
        disperseOffsets[b + 2] = (Math.random() - 0.5) * 40;
      }
    };

    const recalculateBasePositions = () => {
      const viewport = getViewportMetrics();
      const coverScale = Math.max(viewport.width / pixelData.width, viewport.height / pixelData.height);
      const vFovRad = (camera.fov * Math.PI) / 180;
      camDist = viewport.height / (2 * Math.tan(vFovRad / 2));

      camera.aspect = viewport.width / viewport.height;
      camera.near = 2;
      camera.far = camDist * 5;
      camera.position.set(0, 0, camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      for (let i = 0; i < count; i += 1) {
        const b = i * 3;
        const p2 = i * 2;
        basePositions[b] = rawPositions[p2] * coverScale;
        basePositions[b + 1] = rawPositions[p2 + 1] * coverScale;
        basePositions[b + 2] = 0;
      }
    };

    for (let i = 0; i < count; i += 1) {
      const p = pointData[i];
      const b = i * 3;
      const p2 = i * 2;

      rawPositions[p2] = p.x;
      rawPositions[p2 + 1] = p.y;

      colors[b] = p.color.r;
      colors[b + 1] = p.color.g;
      colors[b + 2] = p.color.b;
      swirls[i] = p.swirl;
    }

    initializeOffsets();
    recalculateBasePositions();

    for (let i = 0; i < count; i += 1) {
      const b = i * 3;
      positions[b] = basePositions[b] + introOffsets[b];
      positions[b + 1] = basePositions[b + 1] + introOffsets[b + 1];
      positions[b + 2] = introOffsets[b + 2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();

    const material = new THREE.PointsMaterial({
      size: pointSize * 1.15,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const resize = () => {
      if (!canvasMount.isConnected) return;
      const w = canvasMount.clientWidth;
      const h = canvasMount.clientHeight;
      renderer.setSize(w, h);
      recalculateBasePositions();
      initializeOffsets();
    };
    window.addEventListener("resize", resize);

    const timeline = {
      form: 2100,
      hold: 750,
      disperse: 1500
    };
    const start = performance.now();
    const totalDuration = timeline.form + timeline.hold + timeline.disperse;

    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const easeInQuint = (t) => t * t * t * t * t;

    const animate = (now) => {
      const elapsed = now - start;
      const posAttr = geometry.getAttribute("position");

      let progress = Math.min(elapsed / timeline.form, 1);
      if (elapsed <= timeline.form) {
        material.size = pointSize * 1.15;
        material.opacity = 1;
        const eased = easeOutCubic(progress);
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const wobble = Math.sin(now * 0.0012 + swirls[i]) * 7.5 * (1 - eased);
          positions[b] = basePositions[b] + introOffsets[b] * (1 - eased) + wobble;
          positions[b + 1] = basePositions[b + 1] + introOffsets[b + 1] * (1 - eased) + wobble;
          positions[b + 2] = introOffsets[b + 2] * (1 - eased);
        }
      } else if (elapsed <= timeline.form + timeline.hold) {
        material.size = pointSize * 1.15;
        material.opacity = 1;
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const hover = Math.sin(now * 0.00095 + swirls[i] * 1.6) * 1.2;
          positions[b] = basePositions[b] + hover;
          positions[b + 1] = basePositions[b + 1] + hover * 0.5;
          positions[b + 2] = hover * 0.4;
        }
      } else {
        progress = Math.min((elapsed - timeline.form - timeline.hold) / timeline.disperse, 1);
        const rush = easeInQuint(progress);
        const xyShrink = 1 - rush * 0.93;
        const zEye = camDist * 0.986 * rush;
        const fadeStart = 0.8;
        material.opacity =
          progress <= fadeStart ? 1 : 1 - (progress - fadeStart) / (1 - fadeStart);
        material.size = pointSize * 1.15 * (1 + rush * rush * 2.2);
        const zMax = camDist * 0.99;
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const streak = Math.sin(now * 0.0014 + swirls[i]) * (1 - rush) * 3;
          positions[b] = basePositions[b] * xyShrink + disperseOffsets[b] * rush + streak;
          positions[b + 1] = basePositions[b + 1] * xyShrink + disperseOffsets[b + 1] * rush + streak * 0.55;
          const zJ = zEye + disperseOffsets[b + 2] * rush * 0.12;
          positions[b + 2] = Math.min(zJ, zMax);
        }
      }

      const disperseProgress =
        elapsed <= timeline.form + timeline.hold
          ? 0
          : Math.min((elapsed - timeline.form - timeline.hold) / timeline.disperse, 1);
      const rotDamp = 1 - disperseProgress;
      points.rotation.y = Math.sin(now * 0.00024) * 0.04 * rotDamp;
      points.rotation.x = Math.cos(now * 0.00019) * 0.018 * rotDamp;
      posAttr.needsUpdate = true;
      renderer.render(scene, camera);

      if (elapsed < totalDuration) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    await wait(totalDuration + 60);

    window.removeEventListener("resize", resize);
    loader.classList.add("loader-hidden");
    await wait(420);
    cleanup();
    document.body.classList.remove("is-loading");
    startBgPopTexts();
  } catch (error) {
    loader.classList.add("loader-hidden");
    document.body.classList.remove("is-loading");
    cleanup();
    startBgPopTexts();
  }
}

function initStaticUi() {
  const year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const copyButton = document.getElementById("copyTicker");
  const copyHint = document.getElementById("copyHint");

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText("$broski");
        if (copyHint) {
          copyHint.textContent = "Ticker copied. Send it to your broski.";
        }
      } catch (error) {
        if (copyHint) {
          copyHint.textContent = "Clipboard blocked. Copy this manually: $broski";
        }
      }
    });
  }

  const revealElements = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealElements.length > 0) {
    const observer = new IntersectionObserver(
      (entries, ob) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            ob.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    revealElements.forEach((node) => observer.observe(node));
  } else {
    revealElements.forEach((node) => node.classList.add("in-view"));
  }

  const progress = document.getElementById("scrollProgress");
  if (progress) {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const pageHeight = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = pageHeight > 0 ? (scrollTop / pageHeight) * 100 : 0;
      progress.style.width = `${Math.min(Math.max(ratio, 0), 100)}%`;
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
  }
}

void runParticleLoader();
initStaticUi();
