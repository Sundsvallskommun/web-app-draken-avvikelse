import { PopupMenu, RadioButton, useGui } from '@sk-web-gui/react';
import { useUiSettingsStore } from '@stores/ui-settings-store';
import { Monitor, Moon, Sun } from 'lucide-react';

export const ColorSchemeItems = () => {
  const { setColorScheme, colorScheme } = useGui();
  const setStoredColorScheme = useUiSettingsStore((s) => s.setColorScheme);

  const handleChangeColorScheme = (colorScheme: string) => {
    setStoredColorScheme(colorScheme);
    setColorScheme(colorScheme);
  };

  return (
    <PopupMenu.Items>
      <PopupMenu.Item>
        <RadioButton
          value={'light'}
          onClick={() => {
            handleChangeColorScheme('light');
          }}
          checked={colorScheme === 'light'}
        >
          Ljust <Sun className={colorScheme === 'light' ? '' : 'opacity-50'} />
        </RadioButton>
      </PopupMenu.Item>
      <PopupMenu.Item>
        <RadioButton
          value={'dark'}
          onClick={() => {
            handleChangeColorScheme('dark');
          }}
          checked={colorScheme === 'dark'}
        >
          Mörkt <Moon className={colorScheme === 'dark' ? '' : 'opacity-50'} />
        </RadioButton>
      </PopupMenu.Item>
      <PopupMenu.Item>
        <RadioButton
          value={'system'}
          onClick={() => {
            handleChangeColorScheme('system');
          }}
          checked={colorScheme === 'system'}
        >
          System <Monitor className={colorScheme === 'system' ? '' : 'opacity-50'} />
        </RadioButton>
      </PopupMenu.Item>
    </PopupMenu.Items>
  );
};
