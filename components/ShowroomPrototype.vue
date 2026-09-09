<script setup lang="ts">
withDefaults(defineProps<{
  compact?: boolean;
  highlighted?: boolean;
}>(), {
  compact: false,
  highlighted: false,
});
</script>

<template>
  <article class="prototype" :class="{ 'is-compact': compact, 'has-highlight': highlighted }">
    <header class="prototype-header">
      <a class="prototype-brand" href="#" @click.prevent>
        <span class="prototype-brand-mark" aria-hidden="true">
          <span />
          <span />
        </span>
        NORTHLAND
      </a>
      <nav class="prototype-nav" aria-label="Prototype navigation">
        <a href="#journeys" @click.prevent>Journeys</a>
        <a href="#cabins" @click.prevent>Cabins</a>
        <a href="#journal" @click.prevent>Journal</a>
      </nav>
      <button class="prototype-menu" type="button" aria-label="Open menu">
        <span />
        <span />
      </button>
    </header>

    <section class="prototype-hero">
      <div class="prototype-hero-copy">
        <p class="prototype-overline">62° 14' N · SENJA, NORWAY</p>
        <h1>Go where the<br>signal fades.</h1>
        <p class="prototype-lede">
          Small-group journeys and quiet cabins at the edge of the Norwegian Sea.
        </p>
        <div class="prototype-actions">
          <button class="prototype-primary" type="button">Explore journeys</button>
          <button class="prototype-secondary" type="button">Watch the film <span aria-hidden="true">↗</span></button>
        </div>
      </div>

      <div class="prototype-scene" role="img" aria-label="Abstract coastal landscape">
        <div class="prototype-sun" />
        <div class="prototype-mountain prototype-mountain-back" />
        <div class="prototype-mountain prototype-mountain-front" />
        <div class="prototype-water" />
        <div class="prototype-cabin">
          <span class="prototype-cabin-light" />
        </div>
        <p class="prototype-scene-caption">MIDNIGHT SUN<br>SEASON 2026</p>
      </div>
    </section>

    <section id="journeys" class="prototype-proof">
      <p>Designed for stillness</p>
      <dl>
        <div><dt>08</dt><dd>guests maximum</dd></div>
        <div><dt>04</dt><dd>coastal cabins</dd></div>
        <div><dt>24h</dt><dd>summer daylight</dd></div>
      </dl>
    </section>

    <section id="cabins" class="prototype-editorial">
      <div>
        <p class="prototype-index">FIELD NOTE / 04</p>
        <h2>A slower<br>kind of north.</h2>
      </div>
      <p>
        Routes shaped by weather, local knowledge and the freedom to leave the schedule behind.
      </p>
      <button type="button">Read the field notes <span>→</span></button>
    </section>

    <div v-if="highlighted" class="prototype-highlight" role="note" aria-label="Selected element: primary call to action">
      <span class="prototype-highlight-label">button · primary CTA</span>
    </div>
  </article>
</template>

<style scoped>
.prototype {
  --proto-ink: #0b2338;
  --proto-paper: #f5f4ee;
  --proto-coral: #c83f29;
  position: relative;
  min-height: 100%;
  overflow: hidden;
  background: var(--proto-paper);
  color: var(--proto-ink);
  font-family: "Avenir Next", "Segoe UI", sans-serif;
}

.prototype-header {
  display: flex;
  height: 76px;
  align-items: center;
  justify-content: space-between;
  padding: 0 4.5%;
  border-bottom: 1px solid color-mix(in srgb, var(--proto-ink) 18%, transparent);
}

.prototype-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: inherit;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-decoration: none;
}

.prototype-brand-mark {
  position: relative;
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: flex-end;
}

.prototype-brand-mark span {
  position: absolute;
  bottom: 2px;
  width: 12px;
  height: 18px;
  background: var(--proto-ink);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.prototype-brand-mark span:last-child {
  right: 0;
  height: 14px;
  background: var(--proto-coral);
}

.prototype-nav {
  display: flex;
  align-items: center;
  gap: 34px;
  font-size: 12px;
  font-weight: 650;
}

.prototype-nav a {
  color: inherit;
  text-decoration: none;
}

.prototype-menu {
  display: grid;
  width: 38px;
  height: 38px;
  place-content: center;
  gap: 5px;
  border: 0;
  border-radius: 50%;
  background: var(--proto-ink);
}

.prototype-menu span {
  width: 14px;
  height: 1px;
  background: white;
}

.prototype-hero {
  display: grid;
  min-height: 540px;
  grid-template-columns: minmax(360px, 0.9fr) 1.15fr;
}

.prototype-hero-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 7% 8% 8% 10%;
}

.prototype-overline,
.prototype-index {
  margin: 0 0 24px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.prototype h1 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(46px, 5vw, 76px);
  font-weight: 400;
  letter-spacing: -0.035em;
  line-height: 0.94;
}

.prototype-lede {
  max-width: 33rem;
  margin: 30px 0 0;
  color: #405264;
  font-size: 15px;
  line-height: 1.65;
}

.prototype-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 34px;
}

.prototype-actions button,
.prototype-editorial button {
  min-height: 44px;
  padding: 0 19px;
  border: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 750;
}

.prototype-primary {
  background: var(--proto-coral);
  color: white;
}

.prototype-secondary {
  background: transparent;
  color: var(--proto-ink);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--proto-ink) 32%, transparent);
}

.prototype-scene {
  position: relative;
  min-height: 540px;
  overflow: hidden;
  background: #9fc9d3;
}

.prototype-sun {
  position: absolute;
  top: 14%;
  right: 15%;
  width: 82px;
  height: 82px;
  border-radius: 50%;
  background: #f5c662;
  box-shadow: 0 0 0 18px rgb(245 198 98 / 14%);
}

.prototype-mountain {
  position: absolute;
  inset-inline: 0;
  bottom: 32%;
  height: 46%;
  background: #597b83;
  clip-path: polygon(0 68%, 17% 38%, 31% 60%, 47% 12%, 59% 46%, 72% 26%, 100% 71%, 100% 100%, 0 100%);
}

.prototype-mountain-back {
  bottom: 37%;
  background: #83a8ae;
  clip-path: polygon(0 71%, 13% 51%, 26% 67%, 40% 28%, 52% 55%, 63% 17%, 79% 56%, 91% 37%, 100% 50%, 100% 100%, 0 100%);
}

.prototype-mountain-front {
  background: #244854;
}

.prototype-water {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 34%;
  background: #143546;
  box-shadow: inset 0 18px 0 rgb(255 255 255 / 7%);
}

.prototype-cabin {
  position: absolute;
  right: 15%;
  bottom: 19%;
  width: 112px;
  height: 54px;
  background: #172d37;
  box-shadow: 0 8px 0 rgb(7 25 34 / 30%);
}

.prototype-cabin::before {
  position: absolute;
  top: -24px;
  width: 112px;
  height: 26px;
  background: #172d37;
  clip-path: polygon(0 100%, 50% 0, 100% 100%);
  content: "";
}

.prototype-cabin-light {
  position: absolute;
  top: 14px;
  right: 17px;
  width: 32px;
  height: 23px;
  background: #f5c662;
  box-shadow: 0 0 24px rgb(245 198 98 / 45%);
}

.prototype-scene-caption {
  position: absolute;
  bottom: 8%;
  left: 7%;
  margin: 0;
  color: rgb(255 255 255 / 80%);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1.5;
}

.prototype-proof {
  display: flex;
  min-height: 132px;
  align-items: center;
  gap: 7%;
  padding: 24px 6%;
  background: var(--proto-ink);
  color: white;
}

.prototype-proof > p {
  width: 24%;
  margin: 0;
  color: #aec2ce;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 21px;
  font-style: italic;
}

.prototype-proof dl {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(3, 1fr);
  margin: 0;
}

.prototype-proof dl > div {
  padding-left: 24px;
  border-left: 1px solid rgb(255 255 255 / 17%);
}

.prototype-proof dt {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 27px;
}

.prototype-proof dd {
  margin: 4px 0 0;
  color: #aec2ce;
  font-size: 10px;
}

.prototype-editorial {
  display: grid;
  min-height: 290px;
  grid-template-columns: 1fr 0.8fr;
  align-items: end;
  gap: 8%;
  padding: 7% 8%;
}

.prototype-editorial h2 {
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 48px;
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1;
}

.prototype-editorial > p {
  align-self: center;
  margin: 0;
  color: #526574;
  font-size: 14px;
  line-height: 1.7;
}

.prototype-editorial button {
  justify-self: start;
  padding-inline: 0;
  background: transparent;
  color: var(--proto-ink);
}

.prototype-editorial button span {
  margin-left: 8px;
}

.prototype-highlight {
  position: absolute;
  top: 466px;
  left: 4.5%;
  width: 136px;
  height: 46px;
  border: 2px solid #10b981;
  pointer-events: none;
  box-shadow: 0 0 0 4px rgb(16 185 129 / 18%);
}

.prototype-highlight-label {
  position: absolute;
  bottom: calc(100% + 7px);
  left: -2px;
  padding: 5px 8px;
  border-radius: 5px;
  background: #047857;
  color: white;
  font-size: 10px;
  font-weight: 750;
  white-space: nowrap;
}

.prototype.is-compact .prototype-header {
  height: 52px;
}

.prototype.is-compact .prototype-hero {
  min-height: 340px;
}

.prototype.is-compact .prototype-hero-copy {
  padding: 5% 7%;
}

.prototype.is-compact h1 {
  font-size: 46px;
}

.prototype.is-compact .prototype-highlight {
  top: 292px;
  left: 7%;
  width: 124px;
  height: 44px;
}

.prototype.is-compact .prototype-lede {
  margin-top: 18px;
  font-size: 12px;
}

.prototype.is-compact .prototype-actions {
  margin-top: 22px;
}

.prototype.is-compact .prototype-scene {
  min-height: 340px;
}

.prototype.is-compact .prototype-proof {
  min-height: 92px;
}

.prototype.is-compact .prototype-editorial {
  min-height: 190px;
}

@media (max-width: 760px) {
  .prototype-header { height: 62px; padding-inline: 20px; }
  .prototype-nav { display: none; }
  .prototype-hero { min-height: auto; grid-template-columns: 1fr; }
  .prototype-hero-copy { padding: 48px 24px 42px; }
  .prototype h1 { font-size: 52px; }
  .prototype-scene { min-height: 390px; }
  .prototype-proof { align-items: flex-start; flex-direction: column; }
  .prototype-proof > p { width: auto; }
  .prototype-proof dl { width: 100%; }
  .prototype-editorial { grid-template-columns: 1fr; }
}
</style>
