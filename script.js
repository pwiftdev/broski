import * as THREE from "three";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    return;
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasMount.clientWidth, canvasMount.clientHeight);
  canvasMount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera();

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
        const disperseRadius = viewport.maxDimension * (0.72 + Math.random() * 0.9);

        introOffsets[b] = dirX * entryRadius + (Math.random() - 0.5) * viewport.width * 0.2;
        introOffsets[b + 1] = dirY * entryRadius + (Math.random() - 0.5) * viewport.height * 0.2;
        introOffsets[b + 2] = (Math.random() - 0.5) * 120;

        disperseOffsets[b] = dirX * disperseRadius + (Math.random() - 0.5) * viewport.width * 0.3;
        disperseOffsets[b + 1] = dirY * disperseRadius + (Math.random() - 0.5) * viewport.height * 0.3;
        disperseOffsets[b + 2] = (Math.random() - 0.5) * 220;
      }
    };

    const recalculateBasePositions = () => {
      const viewport = getViewportMetrics();
      const coverScale = Math.max(viewport.width / pixelData.width, viewport.height / pixelData.height);

      camera.left = -viewport.width / 2;
      camera.right = viewport.width / 2;
      camera.top = viewport.height / 2;
      camera.bottom = -viewport.height / 2;
      camera.near = -1200;
      camera.far = 1200;
      camera.position.z = 1;
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
      size: pointSize,
      sizeAttenuation: false,
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
      form: 3200,
      hold: 1700,
      disperse: 2400
    };
    const start = performance.now();
    const totalDuration = timeline.form + timeline.hold + timeline.disperse;

    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const easeInQuad = (t) => t * t;

    const animate = (now) => {
      const elapsed = now - start;
      const posAttr = geometry.getAttribute("position");

      let progress = Math.min(elapsed / timeline.form, 1);
      if (elapsed <= timeline.form) {
        const eased = easeOutCubic(progress);
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const wobble = Math.sin(now * 0.0012 + swirls[i]) * 7.5 * (1 - eased);
          positions[b] = basePositions[b] + introOffsets[b] * (1 - eased) + wobble;
          positions[b + 1] = basePositions[b + 1] + introOffsets[b + 1] * (1 - eased) + wobble;
          positions[b + 2] = introOffsets[b + 2] * (1 - eased);
        }
      } else if (elapsed <= timeline.form + timeline.hold) {
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const hover = Math.sin(now * 0.00095 + swirls[i] * 1.6) * 1.2;
          positions[b] = basePositions[b] + hover;
          positions[b + 1] = basePositions[b + 1] + hover * 0.5;
          positions[b + 2] = hover * 0.4;
        }
      } else {
        progress = Math.min((elapsed - timeline.form - timeline.hold) / timeline.disperse, 1);
        const eased = easeInQuad(progress);
        material.opacity = 1 - eased * 0.92;
        for (let i = 0; i < count; i += 1) {
          const b = i * 3;
          const swirlDrift = Math.sin(now * 0.0011 + swirls[i] * 2.1) * 18 * eased;
          positions[b] = basePositions[b] + disperseOffsets[b] * eased + swirlDrift;
          positions[b + 1] = basePositions[b + 1] + disperseOffsets[b + 1] * eased - swirlDrift * 0.6;
          positions[b + 2] = disperseOffsets[b + 2] * eased;
        }
      }

      points.rotation.y = Math.sin(now * 0.00024) * 0.04;
      points.rotation.x = Math.cos(now * 0.00019) * 0.018;
      posAttr.needsUpdate = true;
      renderer.render(scene, camera);

      if (elapsed < totalDuration) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    await wait(totalDuration + 120);

    window.removeEventListener("resize", resize);
    loader.classList.add("loader-hidden");
    await wait(700);
    cleanup();
    document.body.classList.remove("is-loading");
  } catch (error) {
    loader.classList.add("loader-hidden");
    document.body.classList.remove("is-loading");
    cleanup();
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
