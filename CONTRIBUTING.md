# Contributing to PaySentry

Thank you for your interest in contributing to PaySentry.

## Prerequisites

- Node.js 20+
- TypeScript knowledge
- Familiarity with payment processing concepts

## Setup

```bash
git clone https://github.com/MichaelYangzk/paysentry.git
cd paysentry
npm install
npm run build
```

## Running Tests

```bash
npm test
```

## Package Structure

```
packages/
  core/       # Core payment validation and fraud detection logic
  react/      # React hooks and components
  node/       # Node.js server-side utilities
```

Each package is independently versioned and published under the `@paysentry` scope.

## Development Workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Add or update tests to cover your changes.
4. Ensure `npm run build` and `npm test` pass.
5. Submit a pull request against `main`.

## PR Guidelines

- Keep PRs focused on a single change.
- Reference related issues in the PR description.
- Follow existing code style and conventions.
- Add tests for new functionality.
- Update documentation when changing public APIs.

## Code Style

- TypeScript strict mode enabled.
- Use meaningful variable and function names.
- Prefer explicit types over `any`.

## Questions?

Open an issue or reach out to the maintainers.
