# Animate UI Color System Summary

## Overview
Animate UI uses a modern color system based on CSS Custom Properties with OKLCH color space for better color consistency and accessibility.

## Color System Structure

### 1. Base Colors
- **Black**: `#000`
- **White**: `#fff`

### 2. Neutral Color Palette
A comprehensive gray scale from light to dark:
- **100-950**: Range from very light gray (97% lightness) to near-black (14.5% lightness)
- All use OKLCH format with zero chroma for true grays

### 3. Semantic Color Palettes
Each color family includes 200-950 variations:

#### Red (Error/Accent)
- Light variants: 200-400
- Base: 500 (`oklch(63.7% .237 25.331)`)
- Dark variants: 600-950

#### Green (Success)
- Light variants: 200-400
- Base: 500 (`oklch(72.3% .219 149.579)`)
- Dark variants: 600-800

#### Blue (Info/Primary)
- Light variants: 100-400
- Base: 500 (`oklch(62.3% .214 259.815)`)
- Dark variants: 600-950

#### Yellow/Amber (Warning)
- **Amber 400**: `oklch(82.8% .189 84.429)`
- **Yellow 500**: `oklch(79.5% .184 86.047)`

#### Additional Colors
- **Purple**: 100-500 variations
- **Pink**: 400-600 variations
- **Teal**: 500-800 variations
- **Emerald**: 400-600 variations
- **Indigo**: 600
- **Violet**: 900

### 4. UI Theme System (Shadcn/ui style)
A cohesive theme system for interface components:

#### Backgrounds
- **Main background**: `#fafafa` (very light gray)
- **Card background**: `#fefefe` (nearly white)
- **Muted background**: `#f5f5f5`
- **Popover**: `#fff` (white)

#### Text Colors
- **Main text**: `#0a0a0a` (near-black)
- **Card text**: `#0a0a0a`
- **Muted text**: `#737373`
- **Popover text**: `#272727`

#### Interactive Elements
- **Primary**: `#171717` (dark)
- **Secondary**: `#f5f5f5` (light background)
- **Accent**: `#f0f0f0` (light)
- **Border**: `#9993` (semi-transparent gray)

### 5. Status Colors
- **Info**: Blue 500
- **Success**: Green 500
- **Warning**: Amber/orange
- **Error**: Red 500

### 6. Code Diff Colors
- **Added lines**: Green background with green symbols
- **Removed lines**: Red background with red symbols

## Technical Implementation

### CSS Custom Properties
All colors are defined as CSS custom properties using the `--color-` prefix:

```css
:root {
  --color-red-500: oklch(63.7% .237 25.331);
  --color-fd-primary: #171717;
  --color-fd-background: #fafafa;
}
```

### OKLCH Color Space
- **Advantages**: Better perceptual uniformity, easier color manipulation
- **Format**: `oklch(lightness% chroma hue)`
- **Usage**: Preferred over RGB/HSL for modern color systems

### Tailwind Integration
The system appears to be built on Tailwind CSS with custom extensions for the theme system (`--color-fd-*` variables suggest a "Frost-Design" or similar design system).

## Usage Recommendations

1. **Use semantic names**: Prefer `--color-fd-primary` over hard-coded values
2. **Leverage OKLCH**: Use the OKLCH values for color manipulations
3. **Follow the scale**: Use the 200-950 scale for consistent color variations
4. **Accessibility**: The OKLCH color space provides better built-in accessibility
5. **Theme consistency**: Use the `fd-` prefixed variables for UI components

## Files Generated
- `animate_ui_colors_extracted.css` - Complete CSS custom properties
- `animate_ui_colors.json` - Raw extraction data (49KB)
- `animate_ui_screenshot.png` - Visual reference
- `animate_ui_color_summary.md` - This summary