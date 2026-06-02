# happy-life

Personal lifestyle skills for small daily rituals, taste memory, and playful self-care workflows.

## Skills

| Skill | Use case | Trigger keywords | Output |
|---|---|---|---|
| `daily-coffee-oracle` | Generate and maintain personalized daily coffee recommendations | coffee / 咖啡 / 今日咖啡 / coffee oracle / 星座咖啡 / roast / latte / americano / cold brew | Refined ASCII coffee card and Markdown profile updates |

## daily-coffee-oracle

`daily-coffee-oracle` keeps a Markdown coffee profile, learns from casual coffee conversation, and recommends a daily drink with roast level, flavor notes, caffeine level, oracle-style reasoning, and terminal-native ASCII art.

It can remember signals like:

- "Starbucks dark roast was awful" -> avoid burnt, smoky, very bitter profiles with medium confidence
- "I keep ordering oat lattes" -> prefer oat milk latte as a usual drink
- "Cold brew works better for me than espresso" -> prefer smoother caffeine delivery

Profile storage defaults to `.coffee-oracle/profile.md` in the user's working directory, with `~/.coffee-oracle/profile.md` available for persistent personal use.

## Install

```text
/plugin marketplace add guohaonan-shy/harold-skills
/plugin install happy-life@harold-skills
/reload-plugins
```

## License

MIT
