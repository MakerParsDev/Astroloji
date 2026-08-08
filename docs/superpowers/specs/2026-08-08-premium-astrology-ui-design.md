# Premium Astrology UI Design

## Goal

Transform the existing Jetpack Compose application into a more premium, cohesive astrology experience without changing backend contracts, navigation semantics, billing behavior, authentication behavior, or domain state.

The visual direction is the approved dark cosmic concept: deep midnight blue surfaces, restrained violet nebula glows, warm gold accents, refined serif display typography, glass-like cards, thin luminous borders, and cleaner information hierarchy.

## Scope

Primary redesign targets:
- Home
- Daily horoscope
- Premium/paywall
- Compatibility
- Settings/profile

Shared theme and component work must also improve Weekly, Monthly, Personality, Onboarding, and other screens that already use common Compose primitives.

Out of scope:
- Backend/API behavior changes
- Billing product or pricing logic changes
- Navigation destination changes
- Push-notification lifecycle changes
- New astrology content or scoring algorithms

## Design System

### Color
- Make the premium dark theme the primary experience.
- Use near-black midnight navy for the root background and slightly lifted navy for surfaces.
- Use warm champagne/gold as the primary premium accent.
- Keep violet as atmospheric glow rather than the dominant action color.
- Reserve red/green/blue for semantic metrics and status only.
- Preserve a usable light theme, but optimize visual polish first for dark mode.

### Typography
- Keep a serif display family for brand, zodiac, and major section titles.
- Use sans-serif for body, controls, labels, and dense information.
- Increase hierarchy contrast: larger hero titles, quieter metadata, compact labels.
- Avoid decorative fonts for long-form horoscope text.

### Shape and depth
- Standardize major cards around 20-24dp corner radii.
- Use thin translucent borders with subtle gold tint on premium/hero surfaces.
- Prefer layered gradients and controlled glow over heavy shadows.
- Avoid excessive blur; cards must remain legible on low-end devices.

## Shared Compose Components

Create or evolve reusable primitives in the shared UI layer instead of duplicating screen styling:
- `PremiumGlassCard`: glass-like surface, premium border, configurable content padding.
- `PremiumGoldButton`: primary CTA with accessible contrast and disabled/loading states.
- `PremiumHeroCard`: reusable zodiac/feature hero with atmospheric gradient and optional icon/symbol slot.
- `PremiumSectionHeader`: consistent eyebrow, title, and optional supporting text.
- `PremiumMetricRing`: compact circular score visualization for energy/love/focus-style metrics.
- `PremiumIconTile`: compact quick-access action tile.
- `PremiumPill`: compact lucky number/color or metadata pill.

Existing `CosmicBackground`, `AstrologyCard`, `AstroSectionTitle`, chips, loading, and error primitives should be migrated or wrapped rather than abandoned when practical.

## Screen Design

### Home
- Lead with a zodiac hero card showing the selected sign, localized name/date range, and a clear change/select affordance when supported by existing navigation.
- Place the four compact quick-access actions exposed by the current Home API: Daily, Weekly, Monthly, and Personality. Compatibility remains accessible through existing navigation, without inventing a Home callback.
- Present today's insight as a premium editorial card, not a dense dashboard.
- Keep streak, moon phase, subscription warnings, ads, and current data semantics, but reduce their visual competition with the hero.

### Daily
- Use a centered zodiac header and date treatment.
- Present energy and existing score data through three compact metric rings or equivalent premium indicators.
- Show lucky number/color in paired tiles.
- Keep horoscope sections readable with generous line height and clear locked/premium states.

### Premium
- Use a focused premium header with restrained celestial ornament.
- Show benefits in a compact vertical list with consistent icon containers.
- Preserve actual monthly/weekly catalogue state and purchase behavior.
- Make the selected plan visually dominant without inventing discounts or prices.
- Use one strong gold CTA; loading/error/retry states remain explicit.

### Compatibility
- Center the relationship score between the two selected zodiac signs.
- Use sign bubbles and a luminous score ring as the main visual anchor.
- Keep selectors accessible and obvious before analysis is available.
- Present interpretation and premium lock states as editorial cards.

### Settings/Profile
- Group notification, personalization, account, and about settings into visually separated premium sections.
- Use compact row components with consistent icon containers and switches.
- Preserve destructive action visibility and accessibility; do not hide account deletion behind decorative UI.

## Navigation and motion

Keep the current navigation graph and destination contracts. Restyle the bottom navigation into a low-profile premium bar using gold only for the selected destination. Motion should be short and functional: fades, small scale transitions, and progress animations. Avoid continuous background animation that increases battery/GPU cost.

## Accessibility and responsiveness

- Maintain Material touch targets and semantic labels.
- Gold text/buttons must meet contrast requirements against their actual backgrounds.
- Support large font without clipped critical actions or pricing.
- Use adaptive spacing/flow for compact widths instead of fixed mockup geometry.
- Decorative stars, glows, and zodiac ornaments must not be exposed as accessibility content.

## State and error handling

Visual redesign must preserve existing loading, pull-to-refresh, offline/error, premium-lock, subscription-warning, and retry behavior. The UI may change presentation but must not suppress state that currently affects user decisions.

## Testing and rollout

Implementation is test-driven at the shared-component and screen-contract level where practical. Required verification before merge:
- focused Compose/unit tests for new reusable UI behavior
- existing screenshot/store QA tests updated intentionally
- Detekt
- ktlint
- Android Lint
- JVM unit tests
- device-smoke compilation
- debug assemble
- release bundle dry-run

The redesign ships as normal application code; no production backend migration is required. Any screenshot baseline change must be reviewed as an intentional visual change rather than blindly accepted.

## Success criteria

The app should read immediately as one coherent premium astrology product: consistent midnight/gold visual identity, stronger hierarchy, fewer generic Material surfaces, reusable styling across screens, preserved behavior, and no regression in accessibility or release gates.
