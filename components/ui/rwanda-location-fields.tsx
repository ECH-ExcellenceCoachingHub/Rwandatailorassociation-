"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RWANDA_PROVINCES,
  districtsInProvince,
  provinceForDistrict,
  provinceLabel,
} from "@/lib/rwanda";

/**
 * Province and district, as two linked dropdowns.
 *
 * Every form that records where a member lives uses this, so all of them offer
 * the same thirty districts spelled the same way — the point of the exercise.
 *
 * The two selects are linked in both directions:
 *
 *   • Choosing a province narrows the district list to that province's, and
 *     clears a district that no longer belongs to it. Otherwise a corrected
 *     province leaves the old district behind and the pair contradicts itself.
 *
 *   • Choosing a district fills in its province, because a district determines
 *     its province and asking twice for the same fact invites a mismatch. This
 *     is why the district list is complete, grouped by province, until a
 *     province is picked — the member knows their district, not always which
 *     province it falls under.
 *
 * Renders two `<Field>`s and nothing else, so the calling form owns the layout
 * and these sit in its grid like any other pair of fields.
 *
 * The labels and the province names are translated — "Intara y'Amajyepfo"
 * reads as "Southern Province" in English — but the value submitted is always
 * the English canonical name, so reports group the same either way. District
 * names are not translated: each has one official spelling, and a member
 * looking for Kicukiro looks for "Kicukiro" in either language.
 */

/** Radix rejects an empty item value, so "not recorded" needs a stand-in. */
const NONE = "__none__";

export interface RwandaLocation {
  province: string;
  district: string;
}

interface RwandaLocationFieldsProps extends RwandaLocation {
  onChange: (next: RwandaLocation) => void;
  errors?: {
    province?: string[] | string | null;
    district?: string[] | string | null;
  };
  /** Both are optional by default — half an address is still worth recording. */
  required?: boolean;
  provinceHint?: string;
  districtHint?: string;
  /**
   * Emit hidden inputs named `province` and `district`, for forms that read
   * their values back out of FormData rather than from React state.
   */
  withHiddenInputs?: boolean;
  /** Distinguishes the DOM ids when a page shows more than one address. */
  idPrefix?: string;
}

export function RwandaLocationFields({
  province,
  district,
  onChange,
  errors,
  required,
  provinceHint,
  districtHint,
  withHiddenInputs,
  idPrefix = "",
}: RwandaLocationFieldsProps) {
  const { d, locale } = useLanguage();
  const copy = d.forms;

  const provinceId = `${idPrefix}province`;
  const districtId = `${idPrefix}district`;

  // Complete and grouped until a province is chosen; that province's own
  // districts afterwards.
  const districts = districtsInProvince(province);
  const grouped = !province;

  function selectProvince(value: string) {
    const next = value === NONE ? "" : value;
    const keepDistrict =
      !district || !next || districtsInProvince(next).includes(district);
    onChange({ province: next, district: keepDistrict ? district : "" });
  }

  function selectDistrict(value: string) {
    const next = value === NONE ? "" : value;
    onChange({
      province: next ? provinceForDistrict(next) ?? province : province,
      district: next,
    });
  }

  return (
    <>
      <Field
        id={provinceId}
        label={copy.field.province}
        error={errors?.province}
        hint={provinceHint}
        required={required}
      >
        {(props) => (
          <Select value={province} onValueChange={selectProvince}>
            <SelectTrigger
              id={props.id}
              invalid={props.invalid}
              aria-describedby={props["aria-describedby"]}
            >
              <SelectValue placeholder={copy.location.selectProvince} />
            </SelectTrigger>
            <SelectContent>
              {!required && (
                <SelectItem value={NONE}>{d.common.notRecorded}</SelectItem>
              )}
              {RWANDA_PROVINCES.map((entry) => (
                <SelectItem key={entry.name} value={entry.name}>
                  {provinceLabel(entry.name, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        id={districtId}
        label={copy.field.district}
        error={errors?.district}
        hint={districtHint}
        required={required}
      >
        {(props) => (
          <Select value={district} onValueChange={selectDistrict}>
            <SelectTrigger
              id={props.id}
              invalid={props.invalid}
              aria-describedby={props["aria-describedby"]}
            >
              <SelectValue placeholder={copy.location.selectDistrict} />
            </SelectTrigger>
            <SelectContent>
              {!required && (
                <SelectItem value={NONE}>{d.common.notRecorded}</SelectItem>
              )}

              {grouped
                ? RWANDA_PROVINCES.map((entry) => (
                    <SelectGroup key={entry.name}>
                      <SelectLabel>{provinceLabel(entry.name, locale)}</SelectLabel>
                      {entry.districts.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                : districts.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {withHiddenInputs && (
        <>
          <input type="hidden" name="province" value={province} />
          <input type="hidden" name="district" value={district} />
        </>
      )}
    </>
  );
}
