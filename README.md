# 1C Skills for Kiro (Python)

Автоматическая сборка из [main](https://github.com/fserg/cc-1c-skills) — навыки 1С:Предприятие 8.3 для AI-агента **Kiro** с рантаймом **Python**.

> Эта ветка генерируется CI на каждый push в main. **Не редактируйте напрямую** — все правки идут в [main](https://github.com/fserg/cc-1c-skills).

## Установка

1. Скачайте ZIP этой ветки: **Code → Download ZIP** (или `git archive`).
2. Распакуйте в корень своего проекта — должна появиться папка `.kiro/skills/`.
3. Запустите Kiro из этого проекта — навыки станут доступны.

## Требования

- **Windows** с PowerShell 5.1+ (входит в Windows) — для PowerShell-сборки.
- **Python 3.10+** — для Python-сборки. Зависимости: `lxml>=4.9.0`, `psutil>=5.9.0` (для DOM- и web-навыков).
- **1С:Предприятие 8.3** — для сборки/разборки EPF/ERF и работы с базами.
- **Node.js 18+** — для `/web-test`.

## Документация

Полные гайды, спецификации и описание навыков — в [main](https://github.com/fserg/cc-1c-skills).

---

Source: https://github.com/fserg/cc-1c-skills
Build commit: `7fa279c354517fb1dced24424f11a7ef385620eb`
