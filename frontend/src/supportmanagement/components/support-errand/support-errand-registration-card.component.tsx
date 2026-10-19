'use client';

import { Disclosure, Tabs } from '@sk-web-gui/react';
import { CircleAlert } from 'lucide-react';
import { FC, ReactNode } from 'react';

/**
 * The card the registration choices sit in: the errand page's tab card with its first tab, and the
 * "Om ärendet" section CaseData opens its registration form with. The fields go in two per row.
 */
export const SupportErrandRegistrationCard: FC<{ children: ReactNode }> = ({ children }) => (
  <Tabs
    className="border-1 rounded-12 bg-background-content pt-22 pl-5"
    tabslistClassName="border-0 -m-b-12 flex-wrap ml-10"
    panelsClassName="border-t-1"
    current={0}
    size="sm"
  >
    <Tabs.Item>
      <Tabs.Button className="text-base ml-8">Grundinformation</Tabs.Button>
      <Tabs.Content>
        <div className="w-full py-24 px-32">
          <Disclosure variant="alt" initalOpen>
            <Disclosure.Header>
              <Disclosure.Icon icon={<CircleAlert />} />
              <Disclosure.Title>Om ärendet</Disclosure.Title>
              <Disclosure.Button />
            </Disclosure.Header>
            <Disclosure.Content>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-lg gap-y-24 pb-lg">{children}</div>
            </Disclosure.Content>
          </Disclosure>
        </div>
      </Tabs.Content>
    </Tabs.Item>
  </Tabs>
);
