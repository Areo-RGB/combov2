# AI Coding Guide

This document provides guidance for AI coding agents working on this codebase.

## Code Quality Tools

### Prettier (Code Formatting)
Prettier is configured to automatically format code consistently across the project.

**Run formatting:**
```bash
pnpm run format          # Format all files
pnpm run format:check    # Check if files are formatted
```

**Configuration:** `.prettierrc`
- Single quotes for strings
- 2 space indentation
- 100 character line width (120 for HTML)
- Trailing commas in ES5
- Semicolons required
- LF line endings

### ESLint (Code Linting)
ESLint is configured with TypeScript and Angular-specific rules.

**Run linting:**
```bash
pnpm run lint           # Check for linting errors
pnpm run lint:fix       # Auto-fix linting errors
pnpm run lint:format    # Fix linting + format code
pnpm run check          # Check both formatting and linting
```

**Configuration:** `eslint.config.mjs`
- TypeScript strict mode warnings
- Angular best practices
- Accessibility checks for templates
- Consistent code style

## Development Workflow for AI Agents

### 1. Before Making Changes
```bash
pnpm run check          # Verify current code quality
```

### 2. During Development
- Write code following TypeScript and Angular best practices
- Use Angular signals for state management
- Follow the existing component structure
- Maintain OnPush change detection strategy

### 3. After Making Changes
```bash
pnpm run lint:format    # Auto-fix and format all code
pnpm run check          # Verify code quality
pnpm run test           # Run tests
```

### 4. Before Committing
```bash
pnpm run check          # Final verification
pnpm run test:ci        # Run full test suite
```

## Code Style Guidelines

### TypeScript
- Use explicit types where beneficial for clarity
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Prefix unused variables with underscore: `_unusedParam`

### Angular
- Use standalone components (no NgModules)
- Use signals for reactive state
- Use OnPush change detection
- Follow Angular naming conventions:
  - Components: `kebab-case` with `app-` prefix
  - Directives: `camelCase` with `app` prefix
  - Services: `PascalCase` with `Service` suffix

### HTML Templates
- Use Angular control flow (@if, @for, @switch)
- Prefer self-closing tags when possible
- Use trackBy functions with @for loops
- Follow accessibility best practices

### File Organization
```
src/
├── components/         # Reusable UI components
├── services/          # Business logic and data services
├── sprint-duels/      # Sprint Duels feature module
├── team-duels/        # Team Duels feature module
└── app.component.ts   # Root component
```

## Testing
- Place test files next to source files: `*.spec.ts`
- Use Vitest for unit tests
- Use Testing Library for component tests
- Mock external dependencies

## Common Commands

```bash
# Development
pnpm dev                    # Start dev server
pnpm build                  # Build for production

# Code Quality
pnpm run format             # Format code
pnpm run lint:fix           # Fix linting issues
pnpm run lint:format        # Fix both linting and formatting
pnpm run check              # Check code quality

# Testing
pnpm test                   # Run tests in watch mode
pnpm test:ui                # Run tests with UI
pnpm test:coverage          # Run tests with coverage
pnpm test:ci                # Run tests for CI

# Mobile (Capacitor)
pnpm build:android          # Build and sync Android
pnpm open:android           # Open in Android Studio
```

## AI Agent Best Practices

1. **Always run `pnpm run lint:format` after making changes** - This ensures code consistency
2. **Check the output** - Review any linting warnings or errors
3. **Run tests** - Ensure changes don't break existing functionality
4. **Follow existing patterns** - Match the style of surrounding code
5. **Use descriptive commit messages** - Explain what changed and why
6. **Keep changes focused** - One logical change per commit
7. **Update this guide** - If you establish new patterns or conventions

## Troubleshooting

### Prettier not formatting
- Ensure Prettier extension is installed (VS Code)
- Check `.prettierrc` configuration
- Verify file is not in `.prettierignore`

### ESLint errors
- Run `pnpm run lint:fix` to auto-fix
- Check `eslint.config.mjs` for rules
- Some errors require manual fixes

### Build failures
- Clear cache: `rm -rf .angular node_modules && pnpm install`
- Check TypeScript errors: `pnpm run build`
- Verify all imports are correct

## Resources
- [Angular Style Guide](https://angular.dev/style-guide)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Prettier Documentation](https://prettier.io/docs/)
- [ESLint Documentation](https://eslint.org/docs/)
