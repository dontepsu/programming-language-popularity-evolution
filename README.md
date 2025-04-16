# Programming Language Evolution Visualization

📊 An interactive, animated visualization of how programming languages have evolved in popularity and developer interest over the years — powered by data from the [Stack Overflow Developer Survey](https://insights.stackoverflow.com/survey).

This project takes inspiration from Hans Rosling’s iconic bubble charts to display how languages shift across three dimensions:

- **X-axis:** Actual usage by developers (normalized per year)
- **Y-axis:** Interest from developers (who want to learn/use it)
- **Bubble size:** Average reported salary for developers using that language

Languages are also categorized by:
- 🧠 **Execution model**: Compiled vs. Interpreted
- ♻️ **Memory management**: Manual vs. Garbage Collected

✨ Click on any language bubble to track/untrack it through the animation!

---

## 🚀 Live demo

> https://dontepsu.github.io/programming-language-popularity-evolution/

---

## 📦 Setup Instructions

```bash
npm install
npm run dev
```

## 📊 Data Source

* Stack Overflow Developer Survey (2013–2024)
* Raw survey responses were cleaned, normalized, and filtered into pre-aggregated JSON files for optimal performance

You can regenerate these datasets using the companion Jupyter notebooks or data scripts.

## 🧠 Features

* 🎞️ Hans Rosling–style animated timeline
* 🔍 Filter data by country and age group
* 🖱️ Click-to-track language movement
* 📈 Logarithmic scales for better visibility
* 💰 Salary-driven bubble sizing
* 🧩 Visual encoding of execution & memory model


## References

[F2-Bubbles: Faithful Bubble Set Construction and Flexible Editing](https://ieeexplore.ieee.org/document/9552179)