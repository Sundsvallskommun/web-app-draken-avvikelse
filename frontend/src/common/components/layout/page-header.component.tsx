import { cx } from '@sk-web-gui/react';
import { ElementType, FC, JSX, ReactNode } from 'react';
interface PageHeaderProps {
  logo?: JSX.Element;
  children?: ReactNode;
  /* UserMenu component */
  userMenu?: ReactNode;
  /* Mobile menu component */
  mobileMenu?: ReactNode;
  /* Content on the row below */
  bottomContent?: ReactNode;
  as?: ElementType;
  className?: string;
}

export const PageHeader: FC<PageHeaderProps> = ({
  logo,
  children,
  userMenu,
  mobileMenu,
  bottomContent,
  as: Comp = 'nav',
  className,
}) => {
  return (
    <Comp className={cx('sk-header py-2', className)}>
      <div className="sk-header-container gap-4 max-w-full">
        <div className="sk-header-top-content">
          {logo}
          {children}
          {userMenu && (
            <div className="sk-header-usermenu">
              <div className="sk-header-usermenu-content">{userMenu}</div>
            </div>
          )}
          {mobileMenu && <div className={'sk-header-mobilemenu'}>{mobileMenu}</div>}
        </div>
        {bottomContent && <div className="pb-10">{bottomContent}</div>}
      </div>
    </Comp>
  );
};
