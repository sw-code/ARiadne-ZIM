import React, { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  TextInputProps,
  TouchableOpacity,
} from "react-native";
import Lucide from "@react-native-vector-icons/lucide";
import { AppColors } from "@/src/shared/AppColors";
import { useTranslations } from "@/src/i18n/Translations";

type TextFieldProps = {
  value: string;
  onTextChange: (text: string) => void;
  isAddressChosen?: boolean;
  isLoading?: boolean;
  hasGeocodingResult?: boolean;
  onFocusChange?: (focused: boolean) => void;
  editable?: boolean;
};

type INPUT_STATE = "default" | "focused" | "invalid" | "filled";

export const TextInputComponent = forwardRef<TextInput, TextFieldProps & TextInputProps>(
  (
    {
      value,
      onTextChange,
      isAddressChosen = false,
      isLoading = false,
      hasGeocodingResult = false,
      onFocusChange,
      editable = true,
    },
    ref,
  ) => {
    const t = useTranslations();
    const [isFocused, setIsFocused] = useState(false);
    const isFilled = value.length > 0;
    const previousValueRef = useRef<string>(value);
    const wasFilled = previousValueRef.current.length > 0;
    const [isValidInput, setIsValidInput] = useState(true);
    const isDefault = !isAddressChosen && !isFocused && !isFilled;
    const isFaulty = !isAddressChosen && ((wasFilled && !isFilled) || (isFilled && !isFocused));

    const resetValidation = useCallback(() => {
      if (!isValidInput) {
        setIsValidInput(true);
      }
    }, [isValidInput]);

    useEffect(() => {
      if (value !== previousValueRef.current) {
        previousValueRef.current = value;
      }
    }, [value]);

    //Compute current state from flags
    function getInputState(): INPUT_STATE {
      if (isDefault) {
        return "default";
      } else if (isFaulty || !isValidInput) {
        return "invalid";
      } else if (isFocused) {
        return "focused";
      } else {
        return "filled";
      }
    }

    const inputState: INPUT_STATE = getInputState();

    const styleMap: Record<
      INPUT_STATE,
      {
        container: StyleProp<ViewStyle>;
        input: StyleProp<TextStyle>;
        icon: StyleProp<TextStyle>;
      }
    > = {
      default: {
        container: [styles.frame2, styles.containerDefault],
        input: [styles.inputBase, styles.textDefault, !isFilled && styles.placeholderOpacity],
        icon: styles.iconBase,
      },
      focused: {
        container: [styles.frame2, styles.containerFocused],
        input: [styles.inputBase, isFilled && styles.textFocused, !isFilled && styles.placeholderOpacity],
        icon: styles.iconBase,
      },
      invalid: {
        container: [styles.frame2, styles.containerInvalid],
        input: [styles.inputBase, styles.textInvalid, !isFilled && styles.placeholderOpacity],
        icon: [styles.iconBase, styles.warningColor],
      },
      filled: {
        container: [styles.frame2],
        input: [styles.inputBase, styles.textFilled],
        icon: [styles.iconBase],
      },
    };

    const { container, input, icon } = styleMap[inputState];

    function insertRightIcon() {
      if (isLoading) {
        return <ActivityIndicator color={AppColors.DefaultForeground} size={16} />;
      }
      if (inputState === "filled" && !isFocused) {
        return <Lucide name="check" style={[icon, styles.successColor]} />;
      }
      if (inputState === "invalid") {
        return <Lucide name="circle-alert" style={icon} />;
      }
      return null;
    }

    function insertErrorMessageBelow() {
      if (inputState !== "invalid") return null;
      const message =
        !hasGeocodingResult || !isFilled || !isValidInput
          ? t.destinationInput.invalidDestination
          : t.destinationInput.selectDestinationBelow;
      return <Text style={styles.textInvalid}>{message}</Text>;
    }

    function insertCancelTextButton() {
      if (inputState === "default") return null;
      if (inputState === "focused" && !isFilled) return null;

      const cancelButtonStyle: StyleProp<ViewStyle> = [
        styles.cancelTextButton,
        inputState === "invalid" ? styles.cancelTextButtonWarning : styles.cancelTextButtonOk,
      ];

      return (
        <TouchableOpacity style={cancelButtonStyle} onPress={handleCancelTextButton}>
          <Lucide name="x" style={icon} size={16} />
        </TouchableOpacity>
      );
    }

    function handleCancelTextButton() {
      onTextChange("");
    }

    return (
      <View style={styles.topViewContainerStyle}>
        <Text style={[styles.selectDestination, inputState === "invalid" && styles.textInvalid]}>
          {t.destinationInput.label}
        </Text>

        <View style={container}>
          <View style={styles.content}>
            <Lucide name="search" style={icon} />
            <TextInput
              ref={ref}
              style={input}
              value={value}
              editable={editable}
              onChangeText={(text) => {
                resetValidation();
                onTextChange(text);
              }}
              placeholder={t.destinationInput.placeholder}
              placeholderTextColor={inputState === "invalid" ? AppColors.ErrorForeground : AppColors.DefaultForeground}
              onFocus={() => {
                onFocusChange?.(true);
                setIsFocused(true);
                resetValidation();
              }}
              onBlur={() => {
                onFocusChange?.(false);
                setIsFocused(false);
              }}
            />
            {insertRightIcon()}
          </View>
          {insertCancelTextButton()}
        </View>
        {insertErrorMessageBelow()}
      </View>
    );
  },
);

TextInputComponent.displayName = "TextInputComponent";

const styles = StyleSheet.create({
  topViewContainerStyle: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },

  container: {
    display: "flex",
    flexDirection: "row",
    borderWidth: 2,
    borderRadius: 8,
    alignItems: "center",
    alignSelf: "stretch",
  },
  containerDefault: {
    borderColor: AppColors.DefaultForeground,
  },
  containerFocused: {
    borderColor: AppColors.DefaultForeground,
    borderStyle: "solid",
    borderWidth: 3,
  },
  containerInvalid: {
    borderColor: AppColors.ErrorForeground,
    borderStyle: "solid",
    borderWidth: 2,
  },
  containerInvalidFocused: {
    borderColor: AppColors.ErrorForeground,
    borderStyle: "solid",
    borderWidth: 3,
  },
  inputBase: {
    flex: 1,
    fontSize: 13.373,
    lineHeight: 16,
    fontFamily: "Inter",
  },
  textDefault: {
    color: AppColors.DefaultForeground,
    fontWeight: 500,
  },
  textFilled: {
    color: AppColors.DefaultForeground,
    fontWeight: 500,
  },
  textFocused: {
    color: AppColors.DefaultForeground,
    fontWeight: 700,
  },
  textInvalid: {
    color: AppColors.ErrorForeground,
    fontWeight: 500,
  },
  textInvalidFocused: {
    color: AppColors.ErrorForeground,
    fontWeight: 700,
  },
  placeholderOpacity: {
    opacity: 0.3,
  },
  iconBase: {
    fontSize: 16,
  },
  warningColor: {
    color: AppColors.ErrorForeground,
  },
  selectDestination: {
    alignSelf: "stretch",
    color: AppColors.DefaultForeground,
    fontFamily: "Inter",
    fontSize: 13.373,
    fontWeight: "500",
    textTransform: "uppercase",
  },

  cancelTextButton: {
    flexShrink: 0,
    width: 36,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 6,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  cancelTextButtonWarning: {
    backgroundColor: AppColors.ErrorBackground,
  },
  cancelTextButtonOk: {
    backgroundColor: AppColors.ButtonSecondaryBackground,
  },

  frame2: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    borderRadius: 8,
    borderWidth: 2,
  },
  content: {
    flexDirection: "row",
    padding: 10,
    alignItems: "center",
    gap: 10,
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 0,
  },
  successColor: {
    color: AppColors.SuccessForeground,
  },
});
