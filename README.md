# PIN Action Card

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/docs/faq/custom_repositories)

A Home Assistant dashboard card that shows a **PIN keypad** and, when the right PIN is entered, **runs any action**: navigate to a view, perform an action (service call), toggle an entity, open a URL, show more-info, and more. It can also **reveal a hidden card** with an auto-relock timer.

Inspired by [lovelace-pin-lock-card](https://github.com/qlerup/lovelace-pin-lock-card).

## Features

- On-screen keypad (and keyboard support when the card has focus)
- **Unlock actions**: `navigate`, `perform-action` / `call-service`, `toggle`, `more-info`, `url`, `fire-dom-event`, `delay`, `relock`, plus any other standard Home Assistant action
- **Several actions in a row** (for example: disarm the alarm, wait 1 s, then navigate)
- **Per-code actions**: each PIN can do something different
- Optional **inner card** that is shown only while unlocked, with an auto-relock countdown and a "Lock" button
- Action on wrong PIN (for example: send a notification)
- Lockout after too many wrong attempts
- **Inactivity timeout**: navigate back (or run any action) after no taps for a while. The timer restarts while someone is still using the screen.
- Masked input, auto submit, and a GUI editor with Home Assistant's action picker
- Follows your Home Assistant theme

## Installation

### HACS (custom repository)

1. Open **HACS** in Home Assistant.
2. Open the menu (⋮) in the top right and choose **Custom repositories**.
3. Add `https://github.com/sheaeinhorn/lovelace-pin-action-card` and choose the type **Dashboard**.
4. Search for **PIN Action Card**, install it, and reload the browser.

HACS adds the dashboard resource for you (`/hacsfiles/lovelace-pin-action-card/pin-action-card.js`).

### Manual

1. Copy `pin-action-card.js` to `/config/www/pin-action-card.js`.
2. Go to **Settings → Dashboards → ⋮ → Resources** and add:
   - URL: `/local/pin-action-card.js`
   - Type: **JavaScript module**
3. Reload the browser.

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `type` | string | **required** | `custom:pin-action-card` |
| `codes` | list | **required** | PINs that are accepted. Each one is a string, or an object with `code`, `name` and `action` (see [Per-code actions](#per-code-actions)). **Put the PINs in quotes** so leading zeros are kept. |
| `unlock_action` | action or list | – | What to do after a correct PIN |
| `wrong_action` | action or list | – | What to do after a wrong PIN |
| `lockout_action` | action or list | – | What to do when the keypad is locked out after too many wrong PINs |
| `idle_seconds` | number | `0` | Inactivity timeout after unlocking. Every tap, key press, scroll or mouse move restarts it. `0` turns it off. |
| `idle_action` | action or list | navigate back | What to do after `idle_seconds` with no activity. If the unlock action navigates somewhere, the default is to navigate back to the page with the PIN card. |
| `idle_paths` | list | the unlock action's `navigation_path`s | `idle_action` only runs if the user is still on one of these pages (or a sub-page). That way a user who has already left isn't pulled back. Use `[]` to always run it. |
| `card` | card config | – | Card to show while unlocked |
| `relock_seconds` | number | `60` | Relock the inner card after this many seconds. `0` means it only relocks when you press **Lock**. |
| `max_attempts` | number | `0` | Number of wrong attempts before a lockout. `0` means unlimited attempts. |
| `lockout_seconds` | number | `30` | How long the lockout lasts |
| `title` | string | `PIN Lock` | Card title. Use `""` to hide it. |
| `hint` | string | – | Small text under the title |
| `placeholder` | string | `Enter PIN` | Text shown in the display while it is empty |
| `success_message` | string | `Unlocked` | Message shown after a correct PIN when no inner card is set |
| `error_message` | string | `Wrong PIN` | Message shown after a wrong PIN |
| `mask_input` | boolean | `true` | Show `•` instead of the digits |
| `auto_submit` | boolean | `false` | Submit as soon as a full PIN has been typed |
| `max_width` | string or number | `360px` | Max width of the keypad (`420`, `"420px"`, `"24rem"`) |
| `entity` | string | – | Default entity for `toggle` and `more-info` actions |

### Actions

Actions use the same format as Home Assistant's `tap_action`.

| `action` | Options |
|---|---|
| `navigate` | `navigation_path`, `navigation_replace` (optional) |
| `perform-action` (or `call-service`) | `perform_action` (or `service`), `data`, `target` |
| `toggle` | `entity` |
| `more-info` | `entity` |
| `url` | `url_path`, `new_tab` (default `true`) |
| `fire-dom-event` | anything (fires `ll-custom`, for example for browser_mod) |
| `delay` | `seconds`. Waits before the next action in a list. |
| `relock` | Locks the card again |
| `none` | Does nothing |

Any other action type (for example `assist`) is passed on to Home Assistant's built-in action handler.

## Examples

### Navigate to a protected view

```yaml
type: custom:pin-action-card
title: Admin
codes:
  - "1234"
unlock_action:
  action: navigate
  navigation_path: /lovelace/admin
```

### Disarm the alarm, then go to another view

```yaml
type: custom:pin-action-card
title: Alarm
hint: Enter code to disarm
auto_submit: true
codes:
  - "0852"
unlock_action:
  - action: perform-action
    perform_action: alarm_control_panel.alarm_disarm
    target:
      entity_id: alarm_control_panel.home
  - action: delay
    seconds: 1
  - action: navigate
    navigation_path: /lovelace/home
```

### Go back after inactivity

Unlock opens the admin view. Once nobody has touched the screen for 2 minutes, the card navigates back to the page with the PIN card. Every tap, swipe or key press restarts the 2 minutes. If the user has already left the admin view, nothing happens.

```yaml
type: custom:pin-action-card
title: Admin
codes:
  - "1234"
unlock_action:
  action: navigate
  navigation_path: /lovelace/admin
idle_seconds: 120
```

You can choose your own `idle_action`, for example go to a specific view and turn off the screen:

```yaml
idle_seconds: 300
idle_action:
  - action: navigate
    navigation_path: /lovelace/home
  - action: perform-action
    perform_action: switch.turn_off
    target:
      entity_id: switch.tablet_screen
```

`idle_seconds` also relocks an inner `card`. Set `relock_seconds: 0` to relock the card only after inactivity, not on a fixed timer.

The timer runs in the browser tab, so it stops if the page is reloaded.

### Per-code actions

Each code can have its own `action`. Codes without one use `unlock_action`. `name` is shown in the success message.

```yaml
type: custom:pin-action-card
title: Garage
codes:
  - code: "1111"
    name: Alice
    action:
      action: perform-action
      perform_action: cover.open_cover
      target:
        entity_id: cover.garage_door
  - code: "2222"
    name: Guest
    action:
      action: toggle
      entity: light.driveway
  - "9999"   # uses unlock_action
unlock_action:
  action: navigate
  navigation_path: /lovelace/garage
```

### Reveal a card (with auto relock)

```yaml
type: custom:pin-action-card
title: Heating controls
codes:
  - "4321"
relock_seconds: 120
card:
  type: entities
  entities:
    - climate.living_room
    - switch.boiler
```

You can combine `card` with `unlock_action`. The card is shown and the action runs too.

### Notify on wrong PIN and lock out after 3 tries

```yaml
type: custom:pin-action-card
codes:
  - "1234"
max_attempts: 3
lockout_seconds: 60
unlock_action:
  action: navigate
  navigation_path: /lovelace/secret
wrong_action:
  action: perform-action
  perform_action: notify.mobile_app_my_phone
  data:
    message: Wrong PIN entered on the wall tablet
```

## Security notice

The PINs are stored in your dashboard configuration and checked **in the browser**. Anyone who can edit the dashboard, or open the browser's developer tools, can read them. They can also open a "protected" view directly by its URL. Treat this card as a **convenience lock**, for example to keep kids or guests out of a page. It does not protect anything important.

For a tablet or kiosk, also:

- use a non-admin Home Assistant user,
- hide the sidebar and header, for example with [kiosk-mode](https://github.com/NemesisRE/kiosk-mode),
- turn off dashboard editing for that user.

For real protection, such as disarming an alarm, check the code on the server side as well. For example, use an alarm panel's own `code`, or a script that checks the code.

## License

MIT
