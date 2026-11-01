type ConfettiShape = 'paper' | 'ribbon' | 'round';

type ConfettiParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  color: string;
  shape: ConfettiShape;
  rotation: number;
  rotationSpeed: number;
  flip: number;
  flipSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  wobbleForce: number;
  wind: number;
  burstGravity: number;
  fallGravity: number;
  terminalVelocity: number;
  delay: number;
  age: number;
  life: number;
  falling: boolean;
};

const randomBetween = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum);

function activeConfettiPalette() {
  const source = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
  const match = source.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  const base = match ? match.slice(1).map((part) => Number.parseInt(part, 16)) : [239, 43, 135];
  const mix = (target: number, amount: number) => `rgb(${base.map((channel) => Math.round(channel + (target - channel) * amount)).join(' ')})`;
  return [mix(0, .2), mix(0, .1), source, mix(255, .12), mix(255, .24), mix(255, .36), mix(255, .48), mix(255, .6)];
}

function makeParticle(originX: number, originY: number, index: number, palette: string[]): ConfettiParticle {
  const burstGravity = randomBetween(540, 720);
  const maximumTravel = Math.max(originY + 90, 210);
  // Every particle gets an apex from one continuous range instead of being
  // assigned to a low, middle or ceiling group. The curve favours taller
  // flights while still filling every height between the task and the top.
  const verticalTravel = 90 + Math.pow(Math.random(), .72) * (maximumTravel - 90);
  const horizontalVelocity = randomBetween(-420, 420);
  const shape: ConfettiShape = index % 9 === 0 ? 'round' : index % 4 === 0 ? 'ribbon' : 'paper';

  return {
    x: originX + randomBetween(-4, 4),
    y: originY + randomBetween(-3, 3),
    vx: horizontalVelocity,
    vy: -Math.sqrt(2 * burstGravity * verticalTravel) * randomBetween(.97, 1.03),
    width: shape === 'ribbon' ? randomBetween(3, 5) : randomBetween(6, 10),
    height: shape === 'round' ? randomBetween(6, 9) : shape === 'ribbon' ? randomBetween(15, 23) : randomBetween(10, 16),
    color: palette[index % palette.length],
    shape,
    rotation: randomBetween(0, Math.PI * 2),
    rotationSpeed: randomBetween(-7.8, 7.8),
    flip: randomBetween(0, Math.PI * 2),
    flipSpeed: randomBetween(8, 15),
    wobble: randomBetween(0, Math.PI * 2),
    wobbleSpeed: randomBetween(1.7, 3.4),
    wobbleForce: randomBetween(20, 48),
    wind: randomBetween(-13, 13),
    burstGravity,
    fallGravity: randomBetween(28, 42),
    terminalVelocity: randomBetween(70, 96),
    delay: randomBetween(0, .13),
    age: 0,
    life: randomBetween(12.5, 16),
    falling: false,
  };
}

function drawParticle(context: CanvasRenderingContext2D, particle: ConfettiParticle, opacity: number) {
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.rotation);
  context.globalAlpha = opacity;
  context.fillStyle = particle.color;

  if (particle.shape === 'round') {
    context.beginPath();
    context.arc(0, 0, particle.width / 2, 0, Math.PI * 2);
    context.fill();
  } else if (particle.shape === 'ribbon') {
    const bend = Math.sin(particle.flip) * particle.width * 1.7;
    context.beginPath();
    context.moveTo(-particle.width / 2, -particle.height / 2);
    context.bezierCurveTo(
      particle.width / 2 + bend,
      -particle.height / 6,
      -particle.width / 2 - bend,
      particle.height / 6,
      particle.width / 2,
      particle.height / 2,
    );
    context.lineTo(-particle.width / 2, particle.height / 2);
    context.bezierCurveTo(
      -particle.width / 2 - bend,
      particle.height / 6,
      particle.width / 2 + bend,
      -particle.height / 6,
      -particle.width / 2,
      -particle.height / 2,
    );
    context.fill();
  } else {
    // Scaling by the cosine makes each rectangle show its edge as it tumbles,
    // which reads as light paper rather than a flat block sliding downscreen.
    const flipScale = Math.max(.08, Math.abs(Math.cos(particle.flip)));
    context.scale(flipScale, 1);
    context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
    context.globalAlpha = opacity * .24;
    context.fillStyle = '#ffffff';
    context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, 1);
  }

  context.restore();
}

export function launchCompletionConfetti(originX: number, originY: number) {
  const canvas = document.createElement('canvas');
  canvas.className = 'task-confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;

  const pop = document.createElement('span');
  pop.className = 'task-completion-pop';
  pop.style.left = `${originX}px`;
  pop.style.top = `${originY}px`;
  pop.setAttribute('aria-hidden', 'true');
  pop.append(document.createElement('b'));

  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;
  let pixelRatio = 1;
  const resize = () => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewportWidth * pixelRatio);
    canvas.height = Math.round(viewportHeight * pixelRatio);
    canvas.style.width = `${viewportWidth}px`;
    canvas.style.height = `${viewportHeight}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  resize();
  document.body.append(canvas, pop);
  window.addEventListener('resize', resize, { passive: true });

  const palette = activeConfettiPalette();
  const particles = Array.from({ length: 116 }, (_, index) => makeParticle(originX, originY, index, palette));
  const launchDelay = .58;
  const startedAt = performance.now();
  let previousTime = startedAt;
  let animationFrame = 0;

  const cleanUp = () => {
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    canvas.remove();
    pop.remove();
  };

  const animate = (time: number) => {
    const elapsed = (time - startedAt) / 1000;
    const delta = Math.min(Math.max((time - previousTime) / 1000, 0), .032);
    previousTime = time;
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    let hasLivingParticles = false;
    for (const particle of particles) {
      const particleTime = elapsed - launchDelay - particle.delay;
      if (particleTime < 0) {
        hasLivingParticles = true;
        continue;
      }
      if (particle.age >= particle.life || particle.y > viewportHeight + 48) continue;
      hasLivingParticles = true;
      particle.age += delta;

      if (!particle.falling) {
        particle.vy += particle.burstGravity * delta;
        particle.vx *= Math.exp(-1.8 * delta);
        if (particle.vy >= 0) particle.falling = true;
      } else {
        // Once the burst has reached its apex, each piece settles into a low
        // terminal velocity and sways independently, like a small paper feather.
        particle.vy = Math.min(particle.terminalVelocity, particle.vy + particle.fallGravity * delta);
        particle.vx *= Math.exp(-.72 * delta);
      }

      particle.wobble += particle.wobbleSpeed * delta;
      particle.flip += particle.flipSpeed * delta;
      particle.rotation += particle.rotationSpeed * delta;
      const lateralFlutter = particle.falling ? Math.sin(particle.wobble) * particle.wobbleForce : 0;
      particle.x += (particle.vx + particle.wind + lateralFlutter) * delta;
      particle.y += particle.vy * delta;

      const fadeStart = particle.life * .86;
      const opacity = particle.age > fadeStart
        ? Math.max(0, 1 - (particle.age - fadeStart) / (particle.life - fadeStart))
        : 1;
      drawParticle(context, particle, opacity);
    }

    if (hasLivingParticles && elapsed < 17) animationFrame = window.requestAnimationFrame(animate);
    else cleanUp();
  };

  animationFrame = window.requestAnimationFrame(animate);
}
